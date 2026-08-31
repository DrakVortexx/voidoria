const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { toInt, isPosInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { getItem } = require("../world/items");

const router = express.Router();
router.use(requireAuth);

async function publicListings(playerId, { search, filter } = {}) {
  const where = { status: "ACTIVE" };
  const rows = await prisma.auctionListing.findMany({
    where,
    include: {
      seller: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows
    .filter((l) => {
      const name = getItem(l.itemType)?.name || l.itemType;
      const searchHit = !search || name.toLowerCase().includes(search.toLowerCase()) || l.itemType.toLowerCase().includes(search.toLowerCase());
      const filterHit = !filter ||
        (filter === "mine" && l.sellerId === playerId) ||
        (filter === "cheap" && Number(l.price) < 1000) ||
        (filter === "bought" && l.sellerId !== playerId);
      return searchHit && filterHit;
    })
    .map((l) => ({
      id: l.id,
      itemType: l.itemType,
      name: getItem(l.itemType)?.name || l.itemType,
      quantity: l.quantity,
      price: Number(l.price),
      seller: l.seller.displayName,
      mine: l.sellerId === playerId,
      expiresAt: l.expiresAt,
    }));
}

router.get("", async (req, res) => {
  const search = String(req.query.search || "");
  const filter = String(req.query.filter || "");
  res.json({ listings: await publicListings(req.player.id, { search, filter }) });
});

// list an item for sale
router.post("/list", async (req, res) => {
  try {
    const itemType = String(req.body.itemType || "");
    const quantity = toInt(req.body.quantity);
    const price = toInt(req.body.price);
    if (!isPosInt(quantity)) return res.status(400).json({ error: "Valid quantity required" });
    if (!isPosInt(price)) return res.status(400).json({ error: "Valid price required" });
    if (!getItem(itemType)) return res.status(400).json({ error: "Unknown item" });

    await inventory.removeItem(req.player.id, itemType, quantity);

    await prisma.auctionListing.create({
      data: {
        sellerId: req.player.id,
        itemType,
        quantity,
        price: BigInt(price),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    res.json({ message: `Listed ${quantity} x ${itemType} for $${price}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to list item" });
  }
});

// buy a listing - atomic
router.post("/buy", async (req, res) => {
  try {
    const listingId = String(req.body.listingId || "");
    const listing = await prisma.auctionListing.findUnique({ where: { id: listingId }, include: { seller: true } });
    if (!listing || listing.status !== "ACTIVE") return res.status(404).json({ error: "Listing not available" });
    if (listing.sellerId === req.player.id) return res.status(400).json({ error: "Cannot buy your own listing" });

    const amt = listing.price;
    await prisma.$transaction(async (tx) => {
      // atomic claim: only one buyer wins
      const claimed = await tx.auctionListing.updateMany({
        where: { id: listingId, status: "ACTIVE" },
        data: { status: "SOLD", soldAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("Listing was already purchased");

      await economy.ensureBalance(req.player.id);
      await economy.deduct(req.player.id, amt, { tx });
      await economy.credit(listing.sellerId, amt, { tx });
      await economy.recordTransfer(req.player.id, listing.sellerId, amt, "auction_buy", `Purchase of ${listing.quantity} x ${listing.itemType}`, { tx });

      // give buyer the items within same tx (buyer inventory)
      const _inv = require("../services/inventory");
      await _inv.addItem(req.player.id, listing.itemType, listing.quantity, { tx });
    });
    res.json({ message: `Purchased ${listing.itemType} for $${Number(amt)}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Purchase failed" });
  }
});

router.post("/cancel", async (req, res) => {
  try {
    const listingId = String(req.body.listingId || "");
    const listing = await prisma.auctionListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.sellerId !== req.player.id) return res.status(404).json({ error: "Listing not found" });
    if (listing.status !== "ACTIVE") return res.status(400).json({ error: "Listing no longer active" });
    await prisma.auctionListing.update({ where: { id: listingId }, data: { status: "CANCELLED" } });
    await inventory.addItem(req.player.id, listing.itemType, listing.quantity);
    res.json({ message: "Listing cancelled, items returned" });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to cancel" });
  }
});

module.exports = router;
