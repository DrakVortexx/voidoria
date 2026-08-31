const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sanitizeString, toInt, isPosInt, isNonNegInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { getItem } = require("../world/items");
const { listingIdKey } = require("../world/catalogSeed");
const { ADMIN_USERNAME } = require("../config");

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.username !== ADMIN_USERNAME) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

router.get("/listings", async (req, res) => {
  const listings = await prisma.shopListing.findMany({ include: { category: true } });
  res.json({
    listings: listings.map((l) => ({
      id: l.id, itemType: l.itemType, name: getItem(l.itemType)?.name || l.itemType,
      buyPrice: Number(l.buyPrice), sellPrice: Number(l.sellPrice), available: l.available, category: l.category.name,
    })),
  });
});

router.post("/listings", async (req, res) => {
  try {
    const itemType = String(req.body.itemType || "");
    if (!getItem(itemType)) return res.status(400).json({ error: "Unknown item type" });
    const buyPrice = toInt(req.body.buyPrice);
    const sellPrice = toInt(req.body.sellPrice);
    const categoryId = String(req.body.categoryId || "misc");
    const available = req.body.available !== false;

    const id = listingIdKey(itemType);
    await prisma.shopListing.upsert({
      where: { id },
      update: { buyPrice: BigInt(buyPrice), sellPrice: BigInt(sellPrice), available, categoryId },
      create: { id, itemType, buyPrice: BigInt(buyPrice), sellPrice: BigInt(sellPrice), available, categoryId },
    });
    res.json({ message: `Listing for ${itemType} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/categories", async (req, res) => {
  const id = String(req.body.id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = sanitizeString(String(req.body.name || ""), 40);
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  await prisma.shopCategory.upsert({
    where: { id },
    update: { name },
    create: { id, name },
  });
  res.json({ message: `Category '${name}' saved` });
});

router.get("/players", async (req, res) => {
  const players = await prisma.playerProfile.findMany({
    include: { balances: true },
    orderBy: { level: "desc" },
    take: 50,
  });
  res.json({
    players: players.map((p) => ({
      id: p.id, username: p.displayName, level: p.level, xp: p.xp,
      health: p.health, hunger: p.hunger, dimension: p.dimension,
      coins: Number(p.balances?.[0]?.amount || 0),
    })),
  });
});

router.post("/give", async (req, res) => {
  const username = sanitizeString(String(req.body.username || ""), 20);
  const amount = toInt(req.body.amount);
  if (!isPosInt(amount)) return res.status(400).json({ error: "Valid amount required" });
  const target = await prisma.user.findUnique({ where: { username }, include: { profile: true } });
  if (!target || !target.profile) return res.status(404).json({ error: "Player not found" });
  await economy.creditSystem(target.profile.id, amount, "admin", `Admin grant to ${username}`);
  res.json({ message: `Gave $${amount} to ${username}` });
});

router.post("/item", async (req, res) => {
  const username = sanitizeString(String(req.body.username || ""), 20);
  const itemType = String(req.body.itemType || "");
  const amount = toInt(req.body.amount ?? 1);
  if (!isPosInt(amount)) return res.status(400).json({ error: "Valid amount required" });
  if (!getItem(itemType)) return res.status(400).json({ error: "Unknown item" });
  const target = await prisma.user.findUnique({ where: { username }, include: { profile: true } });
  if (!target || !target.profile) return res.status(404).json({ error: "Player not found" });
  await inventory.addItem(target.profile.id, itemType, amount);
  res.json({ message: `Gave ${amount} x ${itemType} to ${username}` });
});

module.exports = router;
