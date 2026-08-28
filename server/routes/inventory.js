const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const inventory = await prisma.inventory.findMany({
      where: { playerId: req.player.id },
      include: { item: true },
      orderBy: { acquiredAt: "desc" },
    });
    res.json({ inventory });
  } catch (err) {
    console.error("Inventory error:", err);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const items = await prisma.inventory.findMany({
      where: { playerId: req.player.id },
      include: { item: true },
    });

    const ALL_RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "SECRET", "TRANSCENDENTAL", "OMNIVERSAL"];

    const stats = {
      totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
      uniqueItems: items.length,
      totalValue: items.reduce((sum, i) => sum + i.item.basePrice * i.quantity, 0),
      byRarity: Object.fromEntries(ALL_RARITIES.map((r) => [r, 0])),
    };

    for (const inv of items) {
      if (stats.byRarity[inv.item.rarity] !== undefined) {
        stats.byRarity[inv.item.rarity] += inv.quantity;
      }
    }

    res.json({ stats });
  } catch (err) {
    console.error("Inventory stats error:", err);
    res.status(500).json({ error: "Failed to fetch inventory stats" });
  }
});

module.exports = router;
