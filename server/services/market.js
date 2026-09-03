const prisma = require("../db");
const { getItem } = require("../game/items");
const economy = require("./economy");
const inventory = require("./inventory");

const BIG = (n) => BigInt(Math.trunc(Number(n)));

// ---------- Price history & market trends ----------

async function avgPrice(itemDef, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const agg = await prisma.pricePoint.aggregate({
    where: { itemDef, createdAt: { gte: since } },
    _avg: { price: true },
    _sum: { volume: true },
  });
  return { avg: Math.round(agg._avg.price || 0), volume: agg._sum.volume || 0 };
}

async function latestPrice(itemDef) {
  const last = await prisma.pricePoint.findFirst({
    where: { itemDef },
    orderBy: { createdAt: "desc" },
  });
  return last ? Number(last.price) : getItem(itemDef)?.baseValue || 0;
}

async function priceHistory(itemDef, limit = 30) {
  const rows = await prisma.pricePoint.findMany({
    where: { itemDef },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse().map((r) => ({ price: Number(r.price), volume: r.volume, at: r.createdAt }));
}

async function recordPrice(itemDef, price, volume) {
  await prisma.pricePoint.create({ data: { itemDef, price: BIG(price), volume } });
}

// Market overview for an item: current best buy/sell, last trade, volume.
async function summarize(itemDef) {
  const bestBuy = await prisma.marketOrder.findFirst({
    where: { itemDef, side: "BUY", status: { in: ["OPEN", "PARTIAL"] } },
    orderBy: { unitPrice: "desc" },
  });
  const bestSell = await prisma.marketOrder.findFirst({
    where: { itemDef, side: "SELL", status: { in: ["OPEN", "PARTIAL"] } },
    orderBy: { unitPrice: "asc" },
  });
  const last = await prisma.pricePoint.findFirst({ where: { itemDef }, orderBy: { createdAt: "desc" } });
  const { volume } = await avgPrice(itemDef, 24);
  const base = getItem(itemDef)?.baseValue || 0;
  return {
    itemDef,
    name: getItem(itemDef)?.name || itemDef,
    icon: getItem(itemDef)?.icon || "•",
    category: getItem(itemDef)?.category || "misc",
    baseValue: base,
    lastPrice: last ? Number(last.price) : base,
    bestBuy: bestBuy ? Number(bestBuy.unitPrice) : null,
    bestSell: bestSell ? Number(bestSell.unitPrice) : null,
    volume24h: volume,
  };
}

async function marketOverview() {
  const ids = Object.keys(require("../game/items").ITEM);
  const out = [];
  for (const id of ids) out.push(await summarize(id));
  return out;
}

// ---------- Order placement & matching ----------

// Place a SELL order: reserve items, then match against existing BUY orders.
async function placeSell(playerId, itemDef, quantity, unitPrice) {
  if (!getItem(itemDef)) throw new Error("Unknown item");
  if (quantity <= 0) throw new Error("Invalid quantity");
  unitPrice = Math.trunc(Number(unitPrice));
  if (unitPrice <= 0) throw new Error("Invalid price");

  const def = getItem(itemDef);
  let remainingQty = quantity;

  const result = await prisma.$transaction(async (tx) => {
    // remove items from inventory (reserved for sale)
    await inventory.removeItem(playerId, itemDef, quantity, { tx });

    let filledQty = 0;
    let revenue = 0;

    // Match against existing BUY orders at price >= our ask (price-time priority).
    const buyOrders = await tx.marketOrder.findMany({
      where: { itemDef, side: "BUY", status: { in: ["OPEN", "PARTIAL"] }, unitPrice: { gte: BIG(unitPrice) } },
      orderBy: [{ unitPrice: "desc" }, { createdAt: "asc" }],
    });
    for (const bo of buyOrders) {
      if (remainingQty <= 0) break;
      const buyRemaining = bo.quantity - bo.filled;
      if (buyRemaining <= 0) continue;
      const tradeQty = Math.min(remainingQty, buyRemaining);
      const tradeValue = BIG(bo.unitPrice) * BIG(tradeQty);

      // mark the buy order filled (conditional to avoid double-spend)
      const upd = await tx.marketOrder.updateMany({
        where: { id: bo.id, status: { in: ["OPEN", "PARTIAL"] } },
        data: { filled: { increment: tradeQty }, status: bo.quantity - (bo.filled + tradeQty) <= 0 ? "CLOSED" : "PARTIAL" },
      });
      if (upd.count === 0) continue;

      // seller receives funds; buyer's locked currency was already held.
      await economy.credit(playerId, tradeValue, { tx });
      await economy.recordTransfer(null, playerId, tradeValue, "MARKET_SELL", `Sold ${tradeQty} x ${itemDef}`, { tx });

      filledQty += tradeQty;
      revenue += Number(tradeValue);
      remainingQty -= tradeQty;
    }

    await recordPrice(itemDef, revenue > 0 ? Math.round(revenue / filledQty) : unitPrice, filledQty);

    // leftover becomes an open sell listing (items already reserved)
    if (remainingQty > 0) {
      await tx.marketOrder.create({
        data: {
          playerId, itemDef, side: "SELL",
          quantity: remainingQty, filled: 0,
          unitPrice: BIG(unitPrice), status: "OPEN",
        },
      });
    }
    return { sold: filledQty, listed: remainingQty, revenue };
  });
  return result;
}

// Place a BUY order: reserve currency, then match against SELL orders.
async function placeBuy(playerId, itemDef, quantity, unitPrice) {
  if (!getItem(itemDef)) throw new Error("Unknown item");
  if (quantity <= 0) throw new Error("Invalid quantity");
  unitPrice = Math.trunc(Number(unitPrice));
  if (unitPrice <= 0) throw new Error("Invalid price");

  const total = BIG(unitPrice) * BIG(quantity);
  let remainingQty = quantity;

  const result = await prisma.$transaction(async (tx) => {
    // lock the full required currency up front
    await economy.deduct(playerId, total, { tx });

    let filledQty = 0;
    let spent = 0;

    const sellOrders = await tx.marketOrder.findMany({
      where: { itemDef, side: "SELL", status: { in: ["OPEN", "PARTIAL"] }, unitPrice: { lte: BIG(unitPrice) } },
      orderBy: [{ unitPrice: "asc" }, { createdAt: "asc" }],
    });
    for (const so of sellOrders) {
      if (remainingQty <= 0) break;
      const sellRemaining = so.quantity - so.filled;
      if (sellRemaining <= 0) continue;
      const tradeQty = Math.min(remainingQty, sellRemaining);
      const tradeValue = BIG(so.unitPrice) * BIG(tradeQty);

      const upd = await tx.marketOrder.updateMany({
        where: { id: so.id, status: { in: ["OPEN", "PARTIAL"] } },
        data: { filled: { increment: tradeQty }, status: so.quantity - (so.filled + tradeQty) <= 0 ? "CLOSED" : "PARTIAL" },
      });
      if (upd.count === 0) continue;

      // to the seller
      await economy.credit(so.playerId, tradeValue, { tx });
      await economy.recordTransfer(playerId, so.playerId, tradeValue, "MARKET_BUY", `Bought ${tradeQty} x ${itemDef}`, { tx });

      // grant items to buyer (they already paid)
      await inventory.addItem(playerId, itemDef, tradeQty, { tx });

      filledQty += tradeQty;
      spent += Number(tradeValue);
      remainingQty -= tradeQty;
    }

    await recordPrice(itemDef, spent > 0 ? Math.round(spent / filledQty) : unitPrice, filledQty);

    // refund unused lock, then open remaining buy order with the reserved funds
    const used = BIG(spent);
    const refundTotal = total - used - BIG(remainingQty) * BIG(unitPrice);
    const leftoverLock = total - used;
    // If we still want more, keep a buy order with the remaining quantity's funds.
    if (remainingQty > 0) {
      const keep = BIG(remainingQty) * BIG(unitPrice);
      // refund anything beyond the kept amount (e.g., price improvement)
      const extra = leftoverLock - keep;
      if (extra > 0) await economy.credit(playerId, extra, { tx });
      await tx.marketOrder.create({
        data: { playerId, itemDef, side: "BUY", quantity: remainingQty, filled: 0, unitPrice: BIG(unitPrice), status: "OPEN" },
      });
    } else {
      // fully filled: refund the un-spent remainder of the lock
      if (refundTotal > 0) await economy.credit(playerId, refundTotal, { tx });
    }
    return { bought: filledQty, remaining: remainingQty, spent };
  });
  return result;
}

// Cancel an open order; refund items (sell) or currency (buy).
async function cancelOrder(playerId, orderId) {
  const order = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!order || order.playerId !== playerId) throw new Error("Order not found");
  if (!["OPEN", "PARTIAL"].includes(order.status)) throw new Error("Order is not cancellable");

  const remaining = order.quantity - order.filled;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.marketOrder.updateMany({
      where: { id: orderId, status: { in: ["OPEN", "PARTIAL"] }, playerId },
      data: { status: "CANCELLED" },
    });
    if (upd.count === 0) throw new Error("Order is not cancellable");
    if (remaining > 0) {
      if (order.side === "SELL") {
        await inventory.addItem(playerId, order.itemDef, remaining, { tx });
      } else {
        await economy.credit(playerId, BIG(order.unitPrice) * BIG(remaining), { tx });
      }
    }
  });
  return { cancelled: true, returned: remaining };
}

async function myOrders(playerId) {
  const rows = await prisma.marketOrder.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((o) => ({
    id: o.id, itemDef: o.itemDef, side: o.side, quantity: o.quantity,
    filled: o.filled, unitPrice: Number(o.unitPrice), status: o.status, createdAt: o.createdAt,
  }));
}

module.exports = { placeSell, placeBuy, cancelOrder, myOrders, summarize, marketOverview, priceHistory, latestPrice, avgPrice };
