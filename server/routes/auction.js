const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { calculateLevelUp } = require("../services/game");

const router = express.Router();

const AUCTION_EXPIRY_DAYS = 7;
const MIN_PRICE = 1;
const MAX_PRICE = 100000000;

async function expireOverdueListings() {
  const overdue = await prisma.auctionListing.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
  });

  for (const listing of overdue) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.auctionListing.updateMany({
        where: { id: listing.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (claimed.count > 0) {
        await tx.inventory.upsert({
          where: { playerId_itemId: { playerId: listing.sellerId, itemId: listing.itemId } },
          update: { quantity: { increment: listing.quantity } },
          create: { playerId: listing.sellerId, itemId: listing.itemId, quantity: listing.quantity },
        });
      }
    });
  }
}

router.get("/", requireAuth, async (req, res) => {
  try {
    await expireOverdueListings();

    const listings = await prisma.auctionListing.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: {
        item: true,
        seller: { include: { user: { select: { username: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ listings });
  } catch (err) {
    console.error("Auction list error:", err);
    res.status(500).json({ error: "Failed to fetch auction listings" });
  }
});

router.post("/list", requireAuth, async (req, res) => {
  try {
    const { inventoryId } = req.body;
    const quantity = Number(req.body.quantity ?? 1);
    const price = Number(req.body.price);

    if (!inventoryId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: "Invalid listing parameters (quantity 1-99)" });
    }

    if (!Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE) {
      return res.status(400).json({ error: `Price must be between $${MIN_PRICE.toLocaleString()} and $${MAX_PRICE.toLocaleString()}` });
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
      return res.status(400).json({ error: "Not enough items to list" });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + AUCTION_EXPIRY_DAYS);

    const result = await prisma.$transaction(async (tx) => {
      if (inventoryItem.quantity === quantity) {
        await tx.inventory.delete({ where: { id: inventoryId } });
      } else {
        await tx.inventory.update({
          where: { id: inventoryId },
          data: { quantity: { decrement: quantity } },
        });
      }

      const listing = await tx.auctionListing.create({
        data: {
          sellerId: req.player.id,
          itemId: inventoryItem.itemId,
          quantity,
          price,
          expiresAt,
        },
        include: {
          item: true,
          seller: { include: { user: { select: { username: true } } } },
        },
      });

      return { listing };
    });

    res.status(201).json({
      message: `Listed ${quantity}x ${inventoryItem.item.name} for $${price} each`,
      listing: result.listing,
    });
  } catch (err) {
    console.error("Auction list error:", err);
    res.status(500).json({ error: "Failed to create listing" });
  }
});

router.post("/buy/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await prisma.auctionListing.findUnique({
      where: { id },
      include: { item: true },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (listing.status !== "ACTIVE") {
      return res.status(400).json({ error: "Listing is no longer active" });
    }

    if (listing.sellerId === req.player.id) {
      return res.status(400).json({ error: "Cannot buy your own listing" });
    }

    const totalCost = listing.price * listing.quantity;

    if (req.player.coins < totalCost) {
      return res.status(400).json({ error: "Not enough coins" });
    }

    const xpGained = listing.quantity * 5;

    const result = await prisma.$transaction(async (tx) => {
      const buyerLevel = calculateLevelUp(req.player.level, req.player.xp, xpGained);
      const seller = await tx.player.findUnique({ where: { id: listing.sellerId } });
      const sellerLevel = calculateLevelUp(seller.level, seller.xp, 10);

      await tx.player.update({
        where: { id: req.player.id },
        data: {
          coins: { increment: buyerLevel.coinBonus - totalCost },
          level: buyerLevel.level,
          xp: buyerLevel.xp,
        },
      });

      await tx.player.update({
        where: { id: listing.sellerId },
        data: {
          coins: { increment: totalCost + sellerLevel.coinBonus },
          level: sellerLevel.level,
          xp: sellerLevel.xp,
        },
      });

      await tx.inventory.upsert({
        where: { playerId_itemId: { playerId: req.player.id, itemId: listing.itemId } },
        update: { quantity: { increment: listing.quantity } },
        create: { playerId: req.player.id, itemId: listing.itemId, quantity: listing.quantity },
      });

      await tx.auctionListing.update({
        where: { id },
        data: { status: "SOLD" },
      });

      const updatedPlayer = await tx.player.findUnique({ where: { id: req.player.id } });
      return { player: updatedPlayer, buyerLevel };
    });

    res.json({
      message: `Bought ${listing.quantity}x ${listing.item.name} for $${totalCost}`,
      coins: result.player.coins,
      xpGained,
      levelUp: result.buyerLevel.levelsGained > 0,
      newLevel: result.buyerLevel.level,
      coinBonus: result.buyerLevel.coinBonus,
    });
  } catch (err) {
    console.error("Auction buy error:", err);
    res.status(500).json({ error: "Failed to buy listing" });
  }
});

router.post("/cancel/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await prisma.auctionListing.findUnique({ where: { id } });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (listing.sellerId !== req.player.id) {
      return res.status(403).json({ error: "Not your listing" });
    }

    if (listing.status !== "ACTIVE") {
      return res.status(400).json({ error: "Listing is no longer active" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.auctionListing.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      await tx.inventory.upsert({
        where: { playerId_itemId: { playerId: req.player.id, itemId: listing.itemId } },
        update: { quantity: { increment: listing.quantity } },
        create: { playerId: req.player.id, itemId: listing.itemId, quantity: listing.quantity },
      });
    });

    res.json({ message: "Listing cancelled. Items returned to inventory." });
  } catch (err) {
    console.error("Auction cancel error:", err);
    res.status(500).json({ error: "Failed to cancel listing" });
  }
});

module.exports = router;
