const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { toInt, isPosInt, isNonNegInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { getItem } = require("../world/items");
const { listingIdKey } = require("../world/catalogSeed");

const router = express.Router();
router.use(requireAuth);

async function categoryTree() {
  const cats = await prisma.shopCategory.findMany({ orderBy: { id: "asc" } });
  const listings = await prisma.shopListing.findMany({ include: { category: true } });
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    items: listings
      .filter((l) => l.categoryId === c.id && l.available)
      .map((l) => ({
        itemType: l.itemType,
        name: getItem(l.itemType)?.name || l.itemType,
        buyPrice: Number(l.buyPrice),
        sellPrice: Number(l.sellPrice),
        category: c.name,
      })),
  }));
}

router.get("", async (req, res) => {
  res.json({ categories: await categoryTree() });
});

// buy blocks/items
router.post("/buy", async (req, res) => {
  try {
    const itemType = String(req.body.itemType || "");
    const quantity = toInt(req.body.quantity ?? 1);
    if (!isPosInt(quantity)) return res.status(400).json({ error: "Valid quantity required" });
    const listing = await prisma.shopListing.findUnique({
      where: { id: listingIdKey(itemType) },
      include: { category: true },
    });
    if (!listing || !listing.available || Number(listing.buyPrice) < 0) {
      return res.status(400).json({ error: "Item is not for sale" });
    }
    const total = Number(listing.buyPrice) * quantity;
    await economy.paySystem(req.player.id, total, "shop_buy", `Purchase ${quantity} x ${itemType}`);
    try {
      await inventory.addItem(req.player.id, itemType, quantity);
    } catch (e) {
      // refund if inventory full
      await economy.creditSystem(req.player.id, total, "refund", `Refund for full inventory`);
      return res.status(400).json({ error: "Inventory full, purchase refunded" });
    }
    res.json({ message: `Bought ${quantity} x ${itemType} for $${total}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Purchase failed" });
  }
});

router.post("/sell", async (req, res) => {
  try {
    const itemType = String(req.body.itemType || "");
    const quantity = toInt(req.body.quantity ?? 1);
    if (!isPosInt(quantity)) return res.status(400).json({ error: "Valid quantity required" });
    const listing = await prisma.shopListing.findUnique({
      where: { id: listingIdKey(itemType) },
    });
    if (!listing || Number(listing.sellPrice) < 0) {
      return res.status(400).json({ error: "This item cannot be sold" });
    }
    await inventory.removeItem(req.player.id, itemType, quantity);
    const total = Number(listing.sellPrice) * quantity;
    await economy.creditSystem(req.player.id, total, "shop_sell", `Sold ${quantity} x ${itemType}`);
    res.json({ message: `Sold ${quantity} x ${itemType} for $${total}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Sale failed" });
  }
});

router.post("/sellall", async (req, res) => {
  try {
    const itemType = String(req.body.itemType || "");
    const listing = await prisma.shopListing.findUnique({ where: { id: listingIdKey(itemType) } });
    if (!listing || Number(listing.sellPrice) < 0) return res.status(400).json({ error: "Item cannot be sold" });
    const held = await inventory.countItem(req.player.id, itemType);
    if (held <= 0) return res.status(400).json({ error: "You have none of this item" });
    await inventory.removeItem(req.player.id, itemType, held);
    const total = Number(listing.sellPrice) * held;
    await economy.creditSystem(req.player.id, total, "shop_sell", `Sold all ${held} x ${itemType}`);
    res.json({ message: `Sold all ${held} x ${itemType} for $${total}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Sale failed" });
  }
});

module.exports = router;
