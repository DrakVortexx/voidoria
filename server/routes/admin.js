const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ADMIN_USERNAME } = require("../config");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.username !== ADMIN_USERNAME) {
    return res.status(403).json({ error: "Admin access denied" });
  }
  next();
}

router.get("/players", requireAuth, requireAdmin, async (req, res) => {
  try {
    var players = await prisma.player.findMany({
      include: { user: { select: { username: true } } },
      orderBy: { coins: "desc" },
    });
    res.json({ players: players });
  } catch (err) {
    console.error("Admin players error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

router.post("/give-coins", requireAuth, requireAdmin, async (req, res) => {
  try {
    var { username, amount } = req.body;
    if (!username || !amount) {
      return res.status(400).json({ error: "Username and amount required" });
    }

    var user = await prisma.user.findUnique({
      where: { username: username },
      include: { player: true },
    });

    if (!user || !user.player) {
      return res.status(404).json({ error: "Player not found" });
    }

    await prisma.player.update({
      where: { id: user.player.id },
      data: { coins: { increment: parseInt(amount) } },
    });

    res.json({ message: "Gave $" + parseInt(amount).toLocaleString() + " to " + username });
  } catch (err) {
    console.error("Admin give coins error:", err);
    res.status(500).json({ error: "Failed to give coins" });
  }
});

router.post("/give-item", requireAuth, requireAdmin, async (req, res) => {
  try {
    var { username, itemName, quantity } = req.body;
    if (!username || !itemName) {
      return res.status(400).json({ error: "Username and item name required" });
    }

    var user = await prisma.user.findUnique({
      where: { username: username },
      include: { player: true },
    });

    if (!user || !user.player) {
      return res.status(404).json({ error: "Player not found" });
    }

    var item = await prisma.item.findFirst({
      where: { name: { equals: itemName, mode: "insensitive" } },
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found: " + itemName });
    }

    var qty = parseInt(quantity) || 1;

    await prisma.inventory.upsert({
      where: { playerId_itemId: { playerId: user.player.id, itemId: item.id } },
      update: { quantity: { increment: qty } },
      create: { playerId: user.player.id, itemId: item.id, quantity: qty },
    });

    res.json({ message: "Gave " + qty + "x " + item.name + " to " + username });
  } catch (err) {
    console.error("Admin give item error:", err);
    res.status(500).json({ error: "Failed to give item" });
  }
});

router.post("/set-level", requireAuth, requireAdmin, async (req, res) => {
  try {
    var { username, level } = req.body;
    if (!username || !level) {
      return res.status(400).json({ error: "Username and level required" });
    }

    var user = await prisma.user.findUnique({
      where: { username: username },
      include: { player: true },
    });

    if (!user || !user.player) {
      return res.status(404).json({ error: "Player not found" });
    }

    await prisma.player.update({
      where: { id: user.player.id },
      data: { level: parseInt(level), xp: 0 },
    });

    res.json({ message: "Set " + username + " to level " + level });
  } catch (err) {
    console.error("Admin set level error:", err);
    res.status(500).json({ error: "Failed to set level" });
  }
});

module.exports = router;
