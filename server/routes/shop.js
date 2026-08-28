const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { calculateLevelUp } = require("../services/game");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const listings = await prisma.shopListing.findMany({
      where: { active: true, stock: { not: 0 } },
      include: { item: true },
      orderBy: { item: { rarity: "asc" } },
    });
    res.json({ listings });
  } catch (err) {
    console.error("Shop list error:", err);
    res.status(500).json({ error: "Failed to fetch shop" });
  }
});

router.post("/buy", requireAuth, async (req, res) => {
  try {
    const { listingId } = req.body;
    const quantity = Number(req.body.quantity ?? 1);

    if (!listingId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: "Invalid listing or quantity (1-99)" });
    }

    if (typeof listingId !== "string" || listingId.length > 64) {
      return res.status(400).json({ error: "Invalid listing" });
    }

    const listing = await prisma.shopListing.findUnique({
      where: { id: listingId },
      include: { item: true },
    });

    if (!listing || !listing.active) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (listing.stock !== -1 && listing.stock < quantity) {
      return res.status(400).json({ error: "Not enough stock" });
    }

    const totalCost = listing.price * quantity;

    if (req.player.coins < totalCost) {
      return res.status(400).json({ error: "Not enough coins", required: totalCost, current: req.player.coins });
    }

    const xpGained = quantity * 5;

    const result = await prisma.$transaction(async (tx) => {
        const levelResult = calculateLevelUp(req.player.level, req.player.xp, xpGained);

        await tx.player.update({
          where: { id: req.player.id },
          data: {
            coins: { increment: levelResult.coinBonus - totalCost },
            level: levelResult.level,
            xp: levelResult.xp,
          },
        });

      if (listing.stock !== -1) {
        await tx.shopListing.update({
          where: { id: listingId },
          data: { stock: { decrement: quantity } },
        });
      }

      const inventory = await tx.inventory.upsert({
        where: {
          playerId_itemId: { playerId: req.player.id, itemId: listing.itemId },
        },
        update: { quantity: { increment: quantity } },
        create: {
          playerId: req.player.id,
          itemId: listing.itemId,
          quantity,
        },
      });

      const updatedPlayer = await tx.player.findUnique({
        where: { id: req.player.id },
      });

      return { inventory, player: updatedPlayer, levelResult };
    });

    res.json({
      message: `Bought ${quantity}x ${listing.item.name} for ${totalCost} coins`,
      inventory: result.inventory,
      coins: result.player.coins,
      xpGained,
      levelUp: result.levelResult.levelsGained > 0,
      newLevel: result.levelResult.level,
      coinBonus: result.levelResult.coinBonus,
    });
  } catch (err) {
    console.error("Buy error:", err);
    res.status(500).json({ error: "Purchase failed" });
  }
});

router.post("/sell", requireAuth, async (req, res) => {
  try {
    const { inventoryId } = req.body;
    const quantity = Number(req.body.quantity ?? 1);

    if (!inventoryId || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ error: "Invalid inventory item or quantity (1-999)" });
    }

    if (typeof inventoryId !== "string" || inventoryId.length > 64) {
      return res.status(400).json({ error: "Invalid inventory item" });
    }

    const inventoryItem = await prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { item: true },
    });

    if (!inventoryItem || inventoryItem.playerId !== req.player.id) {
      return res.status(404).json({ error: "Item not found in your inventory" });
    }

    if (inventoryItem.quantity < quantity) {
      return res.status(400).json({ error: "Not enough items to sell" });
    }

    const sellPrice = Math.floor(inventoryItem.item.basePrice * 0.6);
    const xpGained = quantity * 3;

    const result = await prisma.$transaction(async (tx) => {
      const levelResult = calculateLevelUp(req.player.level, req.player.xp, xpGained);

      if (inventoryItem.quantity === quantity) {
        await tx.inventory.delete({ where: { id: inventoryId } });
      } else {
        await tx.inventory.update({
          where: { id: inventoryId },
          data: { quantity: { decrement: quantity } },
        });
      }

      const updatedPlayer = await tx.player.update({
        where: { id: req.player.id },
        data: {
          coins: { increment: sellPrice * quantity + levelResult.coinBonus },
          level: levelResult.level,
          xp: levelResult.xp,
        },
      });

      return { player: updatedPlayer, levelResult };
    });

    res.json({
      message: `Sold ${quantity}x ${inventoryItem.item.name} for ${sellPrice * quantity} coins`,
      coins: result.player.coins,
      xpGained,
      levelUp: result.levelResult.levelsGained > 0,
      newLevel: result.levelResult.level,
      coinBonus: result.levelResult.coinBonus,
    });
  } catch (err) {
    console.error("Sell error:", err);
    res.status(500).json({ error: "Sale failed" });
  }
});

module.exports = router;
