const prisma = require("../db");
const { getItem } = require("../world/items");

async function getInventory(playerId) {
  const rows = await prisma.inventorySlot.findMany({
    where: { playerId },
    orderBy: { slot: "asc" },
  });
  return rows;
}

async function countItem(playerId, itemType) {
  const agg = await prisma.inventorySlot.aggregate({
    where: { playerId, itemType },
    _sum: { amount: true },
  });
  return agg._sum.amount || 0;
}

async function hasItem(playerId, itemType, amount = 1) {
  return (await countItem(playerId, itemType)) >= amount;
}

async function removeItem(playerId, itemType, amount, { tx } = {}) {
  const c = tx || prisma;
  let remaining = amount;
  const rows = await c.inventorySlot.findMany({
    where: { playerId, itemType, amount: { gt: 0 } },
    orderBy: { slot: "asc" },
  });
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.amount, remaining);
    if (row.amount - take <= 0) {
      await c.inventorySlot.delete({ where: { id: row.id } });
    } else {
      await c.inventorySlot.update({ where: { id: row.id }, data: { amount: row.amount - take } });
    }
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error("Not enough items");
  }
}

async function firstEmptySlot(playerId) {
  const rows = await prisma.inventorySlot.findMany({ where: { playerId }, select: { slot: true } });
  const used = new Set(rows.map((r) => r.slot));
  for (let s = 0; s < 36; s++) if (!used.has(s)) return s;
  return null;
}

async function addItem(playerId, itemType, amount, { durability = 0, metadata = {}, tx } = {}) {
  const c = tx || prisma;
  const def = getItem(itemType);
  const stack = def ? def.stack : 64;
  let remaining = amount;

  // stack onto existing non-full stacks of same item+stats
  const existing = await c.inventorySlot.findMany({
    where: { playerId, itemType, amount: { lt: stack } },
    orderBy: { slot: "asc" },
  });
  for (const row of existing) {
    if (remaining <= 0) break;
    if (row.durability !== (durability || 0)) continue;
    const space = stack - row.amount;
    const put = Math.min(space, remaining);
    await c.inventorySlot.update({ where: { id: row.id }, data: { amount: row.amount + put } });
    remaining -= put;
  }

  while (remaining > 0) {
    const slot = await firstEmptySlot(playerId);
    if (slot === null) throw new Error("Inventory full");
    const put = Math.min(stack, remaining);
    await c.inventorySlot.create({
      data: { playerId, slot, itemType, amount: put, durability: durability || 0, metadata: metadata || {} },
    });
    remaining -= put;
  }
  return true;
}

module.exports = { getInventory, countItem, hasItem, removeItem, addItem, firstEmptySlot };
