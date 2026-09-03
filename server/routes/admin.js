const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sanitizeString, toInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { getItem } = require("../game/items");
const { ADMIN_USERNAME } = require("../config");

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.username !== ADMIN_USERNAME) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

router.get("/players", async (req, res) => {
  const players = await prisma.playerProfile.findMany({
    include: { stats: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  res.json({
    players: players.map((p) => ({
      id: p.id, name: p.displayName, balance: Number(p.currency),
      level: p.stats?.level || 1, xp: p.stats?.xp || 0, health: p.health,
      posX: p.posX, posY: p.posY, lastSeenAt: p.lastSeenAt,
    })),
  });
});

router.post("/give", async (req, res) => {
  const name = sanitizeString(String(req.body.name || req.body.username || ""), 24);
  const amount = toInt(req.body.amount);
  if (amount <= 0) return res.status(400).json({ error: "Valid amount required" });
  const target = await prisma.playerProfile.findUnique({ where: { displayName: name } });
  if (!target) return res.status(404).json({ error: "Player not found" });
  await economy.creditSystem(target.id, amount, "ADMIN", `Admin grant to ${name}`);
  res.json({ message: `Gave $${amount} to ${name}` });
});

router.post("/item", async (req, res) => {
  const name = sanitizeString(String(req.body.name || req.body.username || ""), 24);
  const itemDef = String(req.body.itemType || "");
  const amount = toInt(req.body.amount ?? 1);
  if (amount <= 0) return res.status(400).json({ error: "Valid amount required" });
  if (!getItem(itemDef)) return res.status(400).json({ error: "Unknown item" });
  const target = await prisma.playerProfile.findUnique({ where: { displayName: name } });
  if (!target) return res.status(404).json({ error: "Player not found" });
  await inventory.addItem(target.id, itemDef, amount);
  res.json({ message: `Gave ${amount} x ${itemDef} to ${name}` });
});

router.post("/crate", async (req, res) => {
  const name = sanitizeString(String(req.body.name || ""), 24);
  const kind = String(req.body.kind || "COMMON").toUpperCase();
  if (!["COMMON", "RARE", "EPIC", "LEGENDARY"].includes(kind)) return res.status(400).json({ error: "Invalid crate kind" });
  const target = await prisma.playerProfile.findUnique({ where: { displayName: name } });
  if (!target) return res.status(404).json({ error: "Player not found" });
  await require("../services/crates").award(target.id, kind, "ADMIN");
  res.json({ message: `Awarded a ${kind} crate to ${name}` });
});

module.exports = router;
