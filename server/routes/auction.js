const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { toInt, isPosInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { getItem } = require("../world/items");

const router = express.Router();
router.use(requireAuth);

const SORT = {
  newest: { createdAt: "desc" },
  cheapest: { price: "asc" },
  highest: { price: "desc" },
  oldest: { createdAt: "asc" },
};

// Player-owned Auction House. Listings are player→player sales. Every mutating
// operation is server-authoritative and atomic.

async function browse(playerId, { search, category, sort, mine } = {}) {
  const where = {};
  if (mine) {
    // My Listings shows everything the player listed, in any status.
    where.sellerId = playerId;
  } else {
    where.status = "ACTIVE";
  }
  const orderBy = SORT[sort] || SORT.newest;

  const rows = await prisma.auctionListing.findMany({
    where,
    include: { seller: { select: { displayName: true } }, buyer: { select: { displayName: true } } },
    orderBy,
    take: 100,
  });

  const q = (search || "").toLowerCase().trim();
  return rows
    .filter((l) => {
      const name = (getItem(l.itemType)?.name || l.itemType).toLowerCase();
      const item = l.itemType.toLowerCase();
      const catHit = !category || (l.metadata?.category || "") === category;
      const searchHit = !q || name.includes(q) || item.includes(q);
      return searchHit && catHit;
    })
    .map((l) => ({
      id: l.id,
      itemType: l.itemType,
      name: getItem(l.itemType)?.name || l.itemType,
      quantity: l.quantity,
      price: Number(l.price),
      seller: l.seller.displayName,
      mine: l.sellerId === playerId,
      buyer: l.buyer?.displayName || null,
      status: l.status,
      category: l.metadata?.category || null,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
    }));
}

router.get("", async (req, res) => {
  const search = String(req.query.search || "");
  const category = String(req.query.category || "");
  const sort = String(req.query.sort || "newest");
  const mine = req.query.mine === "1" || req.query.mine === "true";
  res.json({ listings: await browse(req.player.id, { search, category, sort, mine }) });
});

// Categories used by the auction house UI (derived from the server shop catalog
// plus a free-form category list).
router.get("/categories", async (req, res) => {
  const cats = await prisma.shopItem.findMany({
    where: { enabled: true },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  res.json({ categories: cats.map((c) => c.category) });
});

// List an item for sale. Atomic: items leave the player's inventory and the
// listing is created inside a single transaction.
router.post("/list", async (req, res) => {
  try {
    const itemType = String(req.body.itemType || "");
    const quantity = toInt(req.body.quantity);
    const price = toInt(req.body.price);
    const category = String(req.body.category || "");
    if (!isPosInt(quantity)) return res.status(400).json({ error: "Valid quantity required" });
    if (!isPosInt(price)) return res.status(400).json({ error: "Valid price required" });
    if (!getItem(itemType)) return res.status(400).json({ error: "Unknown item" });

    await prisma.$transaction(async (tx) => {
      await inventory.removeItem(req.player.id, itemType, quantity, { tx });
      await tx.auctionListing.create({
        data: {
          sellerId: req.player.id,
          itemType,
          quantity,
          price: BigInt(price),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          metadata: category ? { category } : {},
        },
      });
    });
    res.json({ message: `Listed ${quantity} x ${itemType} for $${price}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to list item" });
  }
});

// Buy a listing atomically. The conditional update prevents a listing from
// being purchased twice or money being spent twice.
router.post("/buy", async (req, res) => {
  try {
    const listingId = String(req.body.listingId || "");
    const listing = await prisma.auctionListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "ACTIVE") return res.status(404).json({ error: "Listing not available" });
    if (listing.sellerId === req.player.id) return res.status(400).json({ error: "Cannot buy your own listing" });

    const amt = listing.price;

    const result = await prisma.$transaction(async (tx) => {
      // Atomic claim: exactly one buyer can flip status ACTIVE -> SOLD.
      const claimed = await tx.auctionListing.updateMany({
        where: { id: listingId, status: "ACTIVE" },
        data: { status: "SOLD", soldAt: new Date(), buyerId: req.player.id },
      });
      if (claimed.count === 0) throw new Error("Listing was already purchased");

      // Buyer pays, seller receives.
      await economy.deduct(req.player.id, amt, { tx });
      await economy.credit(listing.sellerId, amt, { tx });
      await economy.recordTransfer(
        req.player.id,
        listing.sellerId,
        amt,
        "AUCTION_PURCHASE",
        `Auction purchase of ${listing.quantity} x ${listing.itemType}`,
        { tx }
      );

      // Grant the buyer the items in the same transaction.
      await inventory.addItem(req.player.id, listing.itemType, listing.quantity, { tx });
    });

    res.json({ message: `Purchased ${listing.quantity} x ${listing.itemType} for $${Number(amt)}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Purchase failed" });
  }
});

// Cancel a listing owned by the requesting player. Atomic: status flips and
// items are returned.
router.post("/cancel", async (req, res) => {
  try {
    const listingId = String(req.body.listingId || "");
    const listing = await prisma.auctionListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.sellerId !== req.player.id) return res.status(404).json({ error: "Listing not found" });
    if (listing.status !== "ACTIVE") return res.status(400).json({ error: "Listing no longer active" });

    await prisma.$transaction(async (tx) => {
      const changed = await tx.auctionListing.updateMany({
        where: { id: listingId, status: "ACTIVE", sellerId: req.player.id },
        data: { status: "CANCELLED" },
      });
      if (changed.count === 0) throw new Error("Listing is no longer cancellable");
      await inventory.addItem(req.player.id, listing.itemType, listing.quantity, { tx });
    });
    res.json({ message: "Listing cancelled, items returned" });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to cancel" });
  }
});

module.exports = router;
