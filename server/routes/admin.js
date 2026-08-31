const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sanitizeString, toInt, isPosInt, isNonNegInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { getItem } = require("../world/items");
const { shopItemKey } = require("../world/catalogSeed");
const { ADMIN_USERNAME } = require("../config");

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.username !== ADMIN_USERNAME) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ---- Server Shop management (shop_items) ----

router.get("/listings", async (req, res) => {
  const items = await prisma.shopItem.findMany({ orderBy: [{ category: "asc" }, { displayName: "asc" }] });
  res.json({
    listings: items.map((l) => ({
      id: l.id, itemId: l.itemId, itemType: l.itemId, name: l.displayName,
      displayName: l.displayName, category: l.category,
      buyPrice: Number(l.buyPrice), sellPrice: Number(l.sellPrice),
      enabled: l.enabled, stock: l.stock,
    })),
  });
});

router.post("/listings", async (req, res) => {
  try {
    const itemId = String(req.body.itemId || req.body.itemType || "");
    if (!getItem(itemId)) return res.status(400).json({ error: "Unknown item type" });
    const displayName = String(req.body.displayName || req.body.name || getItem(itemId)?.name || itemId);
    const buyPrice = toInt(req.body.buyPrice);
    const sellPrice = toInt(req.body.sellPrice);
    const category = sanitizeString(String(req.body.category || "Miscellaneous"), 40) || "Miscellaneous";
    const enabled = req.body.enabled !== false;
    const stock = req.body.stock === undefined || req.body.stock === null || req.body.stock === "" ? null : toInt(req.body.stock);

    const id = shopItemKey(itemId);
    await prisma.shopItem.upsert({
      where: { id },
      update: { displayName, category, buyPrice: BigInt(buyPrice), sellPrice: BigInt(sellPrice), enabled, stock },
      create: { id, itemId, displayName, category, buyPrice: BigInt(buyPrice), sellPrice: BigInt(sellPrice), enabled, stock },
    });
    res.json({ message: `Shop item ${itemId} updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Distinct shop categories (now stored as strings on shop_items).
router.get("/categories", async (req, res) => {
  const rows = await prisma.shopItem.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  res.json({ categories: rows.map((r) => r.category) });
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
  await economy.creditSystem(target.profile.id, amount, "ADMIN", `Admin grant to ${username}`);
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
