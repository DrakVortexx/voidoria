const prisma = require("../db");

const BIG = (n) => BigInt(n);

async function ensureBalance(playerId) {
  let bal = await prisma.balance.findUnique({ where: { playerId } });
  if (!bal) {
    bal = await prisma.balance.create({ data: { playerId, amount: BIG(10000) } });
  }
  return bal;
}

async function getBalance(playerId) {
  const bal = await ensureBalance(playerId);
  return bal.amount;
}

async function getBalanceNumber(playerId) {
  const b = await getBalance(playerId);
  return Number(b);
}

// deduct exact amount; throws if insufficient. Uses optimistic DB update.
async function deduct(playerId, amount, { tx } = {}) {
  const c = tx || prisma;
  const amt = BIG(amount);
  if (amt <= 0) throw new Error("Invalid amount");
  const updated = await c.balance.updateMany({
    where: { playerId, amount: { gte: amt } },
    data: { amount: { decrement: amt } },
  });
  if (updated.count === 0) {
    throw new Error("Insufficient funds");
  }
}

async function credit(playerId, amount, { tx } = {}) {
  const c = tx || prisma;
  const amt = BIG(amount);
  if (amt <= 0) throw new Error("Invalid amount");
  await c.balance.update({
    where: { playerId },
    data: { amount: { increment: amt } },
  });
}

// Record a transaction row
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

// atomic transfer between two players
async function transfer(senderId, receiverId, amount, type, reference) {
  const amt = BIG(amount);
  if (amt <= 0) throw new Error("Invalid amount");
  if (senderId === receiverId) throw new Error("Cannot transfer to yourself");

  return prisma.$transaction(async (tx) => {
    await ensureBalance(senderId);
    await ensureBalance(receiverId);
    await deduct(senderId, amt, { tx });
    await credit(receiverId, amt, { tx });
    await recordTransfer(senderId, receiverId, amt, type, reference, { tx });
    return { sender: await getBalance(senderId), receiver: await getBalance(receiverId) };
  });
}

// pay from player to "void"/system (e.g. shop buy)
async function paySystem(playerId, amount, type, reference) {
  const amt = BIG(amount);
  return prisma.$transaction(async (tx) => {
    await ensureBalance(playerId);
    await deduct(playerId, amt, { tx });
    await recordTransfer(playerId, null, amt, type, reference, { tx });
  });
}

// credit player from system (e.g. shop sell)
async function creditSystem(playerId, amount, type, reference) {
  const amt = BIG(amount);
  return prisma.$transaction(async (tx) => {
    await ensureBalance(playerId);
    await credit(playerId, amt, { tx });
    await recordTransfer(null, playerId, amt, type, reference, { tx });
  });
}

async function baltop(limit = 10) {
  const rows = await prisma.balance.findMany({
    orderBy: { amount: "desc" },
    take: limit,
    include: { player: { select: { displayName: true } } },
  });
  return rows.map((r) => ({ name: r.player.displayName, amount: Number(r.amount) }));
}

module.exports = {
  ensureBalance,
  getBalance,
  getBalanceNumber,
  deduct,
  credit,
  transfer,
  paySystem,
  creditSystem,
  recordTransfer,
  baltop,
};
