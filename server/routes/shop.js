const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { toInt, isPosInt } = require("../middleware/validate");
const economy = require("../services/economy");
const inventory = require("../services/inventory");
const { shopItemKey } = require("../world/catalogSeed");

const router = express.Router();
router.use(requireAuth);

// The Shop is controlled by the server (Voidoria). Players can only buy and
// sell through these server-authoritative endpoints; they cannot list items
// or set prices.

async function shopCatalog() {
  const items = await prisma.shopItem.findMany({ where: { enabled: true }, orderBy: [{ category: "asc" }, { displayName: "asc" }] });
  const cats = [];
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.category)) {
      map.set(it.category, { id: it.category, name: it.category, items: [] });
      cats.push({ id: it.category, name: it.category });
    }
    map.get(it.category).items.push({
      id: it.id,
      itemType: it.itemId,
      displayName: it.displayName,
      buyPrice: Number(it.buyPrice),
      sellPrice: Number(it.sellPrice),
      stock: it.stock,
    });
  }
  return { categories: cats.map((c) => ({ ...c, items: map.get(c.id).items })) };
}

router.get("", async (req, res) => {
  res.json(await shopCatalog());
});

// Buy from the server Shop. Atomic: money is deducted, item granted, stock
// decremented, and both transactions are recorded — all or nothing.
router.post("/buy", async (req, res) => {
  try {
    const itemId = String(req.body.itemType || req.body.itemId || "");
    const quantity = toInt(req.body.quantity ?? 1);
    if (!isPosInt(quantity)) return res.status(400).json({ error: "Valid quantity required" });

    const item = await prisma.shopItem.findUnique({ where: { id: shopItemKey(itemId) } });
    if (!item || !item.enabled || Number(item.buyPrice) < 0) {
      return res.status(400).json({ error: "This item is not for sale in the Shop" });
    }
    if (item.stock != null && item.stock < quantity) {
      return res.status(400).json({ error: "The Shop is out of stock for this item" });
    }

    const total = Number(item.buyPrice) * quantity;

    const result = await prisma.$transaction(async (tx) => {
      await economy.deduct(req.player.id, total, { tx });

      if (item.stock != null) {
        const dec = await tx.shopItem.updateMany({
          where: { id: item.id, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (dec.count === 0) throw new Error("The Shop ran out of stock");
      }

      await inventory.addItem(req.player.id, itemId, quantity, { tx });
      await economy.recordTransfer(req.player.id, null, total, "SHOP_PURCHASE", `Bought ${quantity} x ${item.displayName}`, { tx });
      await tx.shopTransaction.create({
        data: { playerId: req.player.id, itemId, quantity, unitPrice: BigInt(item.buyPrice), totalPrice: BigInt(total), type: "BUY" },
      });
    });

    res.json({ message: `Bought ${quantity} x ${item.displayName} for $${total}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Purchase failed" });
  }
});

// Sell an item to the server Shop. Atomic: item removed, money credited,
// stock restored (if limited), transactions recorded.
router.post("/sell", async (req, res) => {
  try {
    const itemId = String(req.body.itemType || req.body.itemId || "");
    const quantity = toInt(req.body.quantity ?? 1);
    if (!isPosInt(quantity)) return res.status(400).json({ error: "Valid quantity required" });

    const item = await prisma.shopItem.findUnique({ where: { id: shopItemKey(itemId) } });
    if (!item || !item.enabled || Number(item.sellPrice) < 0) {
      return res.status(400).json({ error: "The Shop does not buy this item" });
    }

    const total = Number(item.sellPrice) * quantity;

    const result = await prisma.$transaction(async (tx) => {
      await inventory.removeItem(req.player.id, itemId, quantity, { tx });
      await economy.credit(req.player.id, total, { tx });
      if (item.stock != null) {
        await tx.shopItem.update({ where: { id: item.id }, data: { stock: { increment: quantity } } });
      }
      await economy.recordTransfer(null, req.player.id, total, "SHOP_SALE", `Sold ${quantity} x ${item.displayName}`, { tx });
      await tx.shopTransaction.create({
        data: { playerId: req.player.id, itemId, quantity, unitPrice: BigInt(item.sellPrice), totalPrice: BigInt(total), type: "SELL" },
      });
    });

    res.json({ message: `Sold ${quantity} x ${item.displayName} for $${total}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Sale failed" });
  }
});

// Sell every held copy of an item to the server Shop.
router.post("/sellall", async (req, res) => {
  try {
    const itemId = String(req.body.itemType || req.body.itemId || "");
    const item = await prisma.shopItem.findUnique({ where: { id: shopItemKey(itemId) } });
    if (!item || !item.enabled || Number(item.sellPrice) < 0) return res.status(400).json({ error: "The Shop does not buy this item" });

    const held = await inventory.countItem(req.player.id, itemId);
    if (held <= 0) return res.status(400).json({ error: "You have none of this item" });

    const total = Number(item.sellPrice) * held;
    const result = await prisma.$transaction(async (tx) => {
      await inventory.removeItem(req.player.id, itemId, held, { tx });
      await economy.credit(req.player.id, total, { tx });
      if (item.stock != null) {
        await tx.shopItem.update({ where: { id: item.id }, data: { stock: { increment: held } } });
      }
      await economy.recordTransfer(null, req.player.id, total, "SHOP_SALE", `Sold all ${held} x ${item.displayName}`, { tx });
      await tx.shopTransaction.create({
        data: { playerId: req.player.id, itemId, quantity: held, unitPrice: BigInt(item.sellPrice), totalPrice: BigInt(total), type: "SELL" },
      });
    });

    res.json({ message: `Sold all ${held} x ${item.displayName} for $${total}` });
  } catch (err) {
    res.status(400).json({ error: err.message || "Sale failed" });
  }
});

module.exports = router;
