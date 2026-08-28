const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { calculateLevelUp } = require("../services/game");
const { isNonNegInt, isPosInt, sanitizeString } = require("../middleware/validate");

const router = express.Router();

const MAX_TRADE_ITEMS = 50;
const MAX_ITEM_QTY = 999;

function validateTradeItems(payload, field) {
  const raw = payload[field];
  if (raw === undefined) return { items: [], error: null };
  if (!Array.isArray(raw) || raw.length > MAX_TRADE_ITEMS) {
    return { items: [], error: `${field} must be an array of at most ${MAX_TRADE_ITEMS} items` };
  }

  const items = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { items: [], error: `Invalid entry in ${field}` };
    }
    const itemId = sanitizeString(entry.itemId, 64);
    const qty = Number(entry.quantity ?? 1);
    if (!itemId || !isPosInt(qty) || qty > MAX_ITEM_QTY) {
      return { items: [], error: `Invalid item or quantity in ${field}` };
    }
    if (seen.has(itemId)) {
      return { items: [], error: `Duplicate item in ${field}` };
    }
    seen.add(itemId);
    items.push({ itemId, quantity: qty });
  }

  return { items, error: null };
}

router.post("/create", requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const receiverUsername = sanitizeString(payload.receiverUsername, 20);
    const offerCoins = Number(payload.offerCoins ?? 0);
    const requestCoins = Number(payload.requestCoins ?? 0);

    const offerCheck = validateTradeItems(payload, "offerItems");
    const requestCheck = validateTradeItems(payload, "requestItems");
    if (offerCheck.error) return res.status(400).json({ error: offerCheck.error });
    if (requestCheck.error) return res.status(400).json({ error: requestCheck.error });
    const offerItems = offerCheck.items;
    const requestItems = requestCheck.items;

    if (!receiverUsername) {
      return res.status(400).json({ error: "Receiver username is required" });
    }

    if (!isNonNegInt(offerCoins) || !isNonNegInt(requestCoins)) {
      return res.status(400).json({ error: "Coin amounts must be non-negative integers" });
    }

    if (offerCoins === 0 && requestCoins === 0 && offerItems.length === 0 && requestItems.length === 0) {
      return res.status(400).json({ error: "Trade must include coins or items" });
    }

    const receiverUser = await prisma.user.findUnique({
      where: { username: receiverUsername },
      include: { player: true },
    });

    if (!receiverUser || !receiverUser.player) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    if (receiverUser.player.id === req.player.id) {
      return res.status(400).json({ error: "Cannot trade with yourself" });
    }

    if (offerCoins > req.player.coins) {
      return res.status(400).json({ error: "Not enough coins to offer" });
    }

    if (requestCoins > receiverUser.player.coins) {
      return res.status(400).json({ error: "Receiver doesn't have enough coins" });
    }

    for (const item of offerItems) {
      const inv = await prisma.inventory.findFirst({
        where: { playerId: req.player.id, itemId: item.itemId },
      });
      if (!inv || inv.quantity < item.quantity) {
        return res.status(400).json({ error: `Not enough of item ${item.itemId} to offer` });
      }
    }

    for (const item of requestItems) {
      const inv = await prisma.inventory.findFirst({
        where: { playerId: receiverUser.player.id, itemId: item.itemId },
      });
      if (!inv || inv.quantity < item.quantity) {
        return res.status(400).json({ error: `Receiver doesn't have enough of item ${item.itemId}` });
      }
    }

    const trade = await prisma.trade.create({
      data: {
        senderId: req.player.id,
        receiverId: receiverUser.player.id,
        offerCoins,
        requestCoins,
        items: {
          create: [
            ...offerItems.map((i) => ({
              itemId: i.itemId,
              quantity: i.quantity || 1,
              direction: "OFFER",
            })),
            ...requestItems.map((i) => ({
              itemId: i.itemId,
              quantity: i.quantity || 1,
              direction: "REQUEST",
            })),
          ],
        },
      },
      include: {
        items: { include: { item: true } },
        sender: { include: { user: true } },
        receiver: { include: { user: true } },
      },
    });

    res.status(201).json({ trade });
  } catch (err) {
    console.error("Create trade error:", err);
    res.status(500).json({ error: "Failed to create trade" });
  }
});

router.get("/pending", requireAuth, async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      where: {
        OR: [
          { senderId: req.player.id },
          { receiverId: req.player.id },
        ],
        status: "PENDING",
      },
      include: {
        items: { include: { item: true } },
        sender: { include: { user: { select: { username: true } } } },
        receiver: { include: { user: { select: { username: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ trades });
  } catch (err) {
    console.error("Pending trades error:", err);
    res.status(500).json({ error: "Failed to fetch pending trades" });
  }
});

router.post("/:tradeId/accept", requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;

    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { items: true },
    });

    if (!trade) {
      return res.status(404).json({ error: "Trade not found" });
    }

    if (trade.receiverId !== req.player.id) {
      return res.status(403).json({ error: "Not authorized to accept this trade" });
    }

    if (trade.status !== "PENDING") {
      return res.status(400).json({ error: "Trade is no longer pending" });
    }

    const receiver = await prisma.player.findUnique({ where: { id: trade.receiverId } });
    const sender = await prisma.player.findUnique({ where: { id: trade.senderId } });

    if (receiver.coins < trade.requestCoins) {
      return res.status(400).json({ error: "You don't have enough coins" });
    }
    if (sender.coins < trade.offerCoins) {
      return res.status(400).json({ error: "Sender doesn't have enough coins" });
    }

    const offerItems = trade.items.filter((i) => i.direction === "OFFER");
    const requestItems = trade.items.filter((i) => i.direction === "REQUEST");

    for (const item of offerItems) {
      const inv = await prisma.inventory.findFirst({
        where: { playerId: trade.senderId, itemId: item.itemId },
      });
      if (!inv || inv.quantity < item.quantity) {
        return res.status(400).json({ error: "Sender no longer has the offered items" });
      }
    }

    for (const item of requestItems) {
      const inv = await prisma.inventory.findFirst({
        where: { playerId: trade.receiverId, itemId: item.itemId },
      });
      if (!inv || inv.quantity < item.quantity) {
        return res.status(400).json({ error: "You no longer have the requested items" });
      }
    }

    await prisma.$transaction(async (tx) => {
      const senderLevel = calculateLevelUp(sender.level, sender.xp, 25);
      const receiverLevel = calculateLevelUp(receiver.level, receiver.xp, 25);

      await tx.player.update({
        where: { id: trade.senderId },
        data: {
          coins: { increment: trade.requestCoins - trade.offerCoins + senderLevel.coinBonus },
          level: senderLevel.level,
          xp: senderLevel.xp,
        },
      });
      await tx.player.update({
        where: { id: trade.receiverId },
        data: {
          coins: { increment: trade.offerCoins - trade.requestCoins + receiverLevel.coinBonus },
          level: receiverLevel.level,
          xp: receiverLevel.xp,
        },
      });

      for (const item of offerItems) {
        await tx.inventory.update({
          where: { playerId_itemId: { playerId: trade.senderId, itemId: item.itemId } },
          data: { quantity: { decrement: item.quantity } },
        });
        await tx.inventory.upsert({
          where: { playerId_itemId: { playerId: trade.receiverId, itemId: item.itemId } },
          update: { quantity: { increment: item.quantity } },
          create: { playerId: trade.receiverId, itemId: item.itemId, quantity: item.quantity },
        });
      }

      for (const item of requestItems) {
        await tx.inventory.update({
          where: { playerId_itemId: { playerId: trade.receiverId, itemId: item.itemId } },
          data: { quantity: { decrement: item.quantity } },
        });
        await tx.inventory.upsert({
          where: { playerId_itemId: { playerId: trade.senderId, itemId: item.itemId } },
          update: { quantity: { increment: item.quantity } },
          create: { playerId: trade.senderId, itemId: item.itemId, quantity: item.quantity },
        });
      }

      await tx.trade.update({
        where: { id: tradeId },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });

      await tx.inventory.deleteMany({
        where: {
          playerId: { in: [trade.senderId, trade.receiverId] },
          quantity: { lte: 0 },
        },
      });
    });

    res.json({ message: "Trade accepted" });
  } catch (err) {
    console.error("Accept trade error:", err);
    res.status(500).json({ error: "Failed to accept trade" });
  }
});

router.post("/:tradeId/decline", requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      return res.status(404).json({ error: "Trade not found" });
    }

    if (trade.receiverId !== req.player.id && trade.senderId !== req.player.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (trade.status !== "PENDING") {
      return res.status(400).json({ error: "Trade is no longer pending" });
    }

    await prisma.trade.update({
      where: { id: tradeId },
      data: { status: "DECLINED", resolvedAt: new Date() },
    });

    res.json({ message: "Trade declined" });
  } catch (err) {
    console.error("Decline trade error:", err);
    res.status(500).json({ error: "Failed to decline trade" });
  }
});

router.post("/:tradeId/cancel", requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      return res.status(404).json({ error: "Trade not found" });
    }

    if (trade.senderId !== req.player.id) {
      return res.status(403).json({ error: "Only the sender can cancel" });
    }

    if (trade.status !== "PENDING") {
      return res.status(400).json({ error: "Trade is no longer pending" });
    }

    await prisma.trade.update({
      where: { id: tradeId },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    res.json({ message: "Trade cancelled" });
  } catch (err) {
    console.error("Cancel trade error:", err);
    res.status(500).json({ error: "Failed to cancel trade" });
  }
});

module.exports = router;
