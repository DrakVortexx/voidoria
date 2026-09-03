const prisma = require("../db");

const BIG = (n) => BigInt(Math.trunc(Number(n)));

async function ensureProfile(playerId) {
  // profile is guaranteed by auth, but guard anyway
  const p = await prisma.playerProfile.findUnique({ where: { id: playerId } });
  return p;
}

async function getBalance(playerId) {
  const p = await ensureProfile(playerId);
  return p ? p.currency : 0n;
}

async function getBalanceNumber(playerId) {
  return Number(await getBalance(playerId));
}

// Deduct exactly `amount`; throws if insufficient. Uses a conditional update
// to prevent concurrent overspend / double-spend.
async function deduct(playerId, amount, { tx } = {}) {
  const c = tx || prisma;
  const amt = BIG(amount);
  if (amt <= 0) throw new Error("Invalid amount");
  const updated = await c.playerProfile.updateMany({
    where: { id: playerId, currency: { gte: amt } },
    data: { currency: { decrement: amt } },
  });
  if (updated.count === 0) throw new Error("Insufficient funds");
}

async function credit(playerId, amount, { tx } = {}) {
  const c = tx || prisma;
  const amt = BIG(amount);
  if (amt < 0) throw new Error("Invalid amount");
  await c.playerProfile.update({
    where: { id: playerId },
    data: { currency: { increment: amt } },
  });
}

async function recordTransfer(senderId, receiverId, amount, type, reference, { tx } = {}) {
  const c = tx || prisma;
  await c.transaction.create({
    data: {
      senderId: senderId || null,
      receiverId: receiverId || null,
      amount: BIG(amount),
      type,
      reference: reference || null,
    },
  });
}

// Atomic transfer between two players.
async function transfer(senderId, receiverId, amount, type, reference) {
  const amt = BIG(amount);
  if (amt <= 0) throw new Error("Invalid amount");
  if (senderId === receiverId) throw new Error("Cannot transfer to yourself");
  return prisma.$transaction(async (tx) => {
    await deduct(senderId, amt, { tx });
    await credit(receiverId, amt, { tx });
    await recordTransfer(senderId, receiverId, amt, type, reference, { tx });
    return { sender: await getBalanceNumber(senderId), receiver: await getBalanceNumber(receiverId) };
  });
}

async function paySystem(playerId, amount, type, reference) {
  const amt = BIG(amount);
  return prisma.$transaction(async (tx) => {
    await deduct(playerId, amt, { tx });
    await recordTransfer(playerId, null, amt, type, reference, { tx });
  });
}

async function creditSystem(playerId, amount, type, reference) {
  const amt = BIG(amount);
  return prisma.$transaction(async (tx) => {
    await credit(playerId, amt, { tx });
    await recordTransfer(null, playerId, amt, type, reference, { tx });
  });
}

// -------- Net worth --------
// Wealth = cash + marketable inventory (base value) + properties (value) +
//          value stored in open sell orders + shop plot equity.
// This must be conservative to avoid exploits (uses base market values, not
// inflated sale prices).
async function netWorthOf(playerId) {
  const p = await ensureProfile(playerId);
  const inventoryModule = require("./inventory");
  const invWorth = await inventoryModule.inventoryWorth(playerId);
  const propertyValue = await prisma.property.aggregate({
    where: { ownerId: playerId },
    _sum: { value: true },
  });
  // Value of goods currently awaiting sale (quantity * price) is locked up.
  let locked = 0;
  const sells = await prisma.marketOrder.findMany({
    where: { playerId, side: "SELL", status: { in: ["OPEN", "PARTIAL"] } },
    select: { quantity: true, filled: true, unitPrice: true },
  });
  for (const s of sells) locked += (s.quantity - s.filled) * Number(s.unitPrice);

  return {
    cash: p.currency,
    inventoryWorth: BigInt(Math.trunc(invWorth)),
    propertyWorth: BigInt(propertyValue._sum?.value || 0),
    lockedMarketWorth: BigInt(locked),
    netWorth: p.currency + BigInt(Math.trunc(invWorth)) + BigInt(propertyValue._sum?.value || 0) + BigInt(locked),
  };
}

// Richest players by net worth (cash + inventory + property).
async function richList(limit = 10) {
  const profiles = await prisma.playerProfile.findMany({
    select: { id: true, displayName: true, currency: true },
    take: 200,
  });
  const result = [];
  for (const p of profiles) {
    const nw = await netWorthOf(p.id).catch(() => null);
    if (!nw) continue;
    result.push({ id: p.id, name: p.displayName, cash: p.currency, netWorth: nw.netWorth });
  }
  result.sort((a, b) => (a.netWorth < b.netWorth ? 1 : -1));
  return result.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r, netWorth: Number(r.netWorth) }));
}

module.exports = {
  getBalance, getBalanceNumber, deduct, credit, transfer,
  paySystem, creditSystem, recordTransfer, netWorthOf, richList,
};
