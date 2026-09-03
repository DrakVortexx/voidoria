const prisma = require("../db");
const { getItem, BY_ID } = require("../game/items");

const INVENTORY_CAPACITY = 40; // max unique stacks

async function getInventory(playerId) {
  return prisma.inventoryStack.findMany({ where: { playerId }, orderBy: { updatedAt: "asc" } });
}

async function countItem(playerId, itemDef) {
  const agg = await prisma.inventoryStack.aggregate({ where: { playerId, itemDef }, _sum: { amount: true } });
  return agg._sum.amount || 0;
}

async function hasItem(playerId, itemDef, amount = 1) {
  return (await countItem(playerId, itemDef)) >= amount;
}

// Remove `amount` of an item, preferring lower-quality stacks first (FIFO-ish).
async function removeItem(playerId, itemDef, amount, { tx } = {}) {
  const c = tx || prisma;
  let remaining = amount;
  const rows = await c.inventoryStack.findMany({
    where: { playerId, itemDef, amount: { gt: 0 } },
    orderBy: [{ quality: "asc" }, { updatedAt: "asc" }],
  });
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.amount, remaining);
    if (row.amount - take <= 0) {
      await c.inventoryStack.delete({ where: { id: row.id } });
    } else {
      await c.inventoryStack.update({ where: { id: row.id }, data: { amount: row.amount - take } });
    }
    remaining -= take;
  }
  if (remaining > 0) throw new Error("Not enough items");
}

// Add an item. Stacks onto existing stacks of the same def+quality (when it is
// a stackable commodity) or creates a new stack. Equipment/tools (stack:1) each
// get their own stack to preserve quality/durability/creator metadata.
async function addItem(playerId, itemDef, amount, { quality = 1, durability = 1, metadata = {}, tx } = {}) {
  const c = tx || prisma;
  const def = getItem(itemDef);
  if (!def) throw new Error("Unknown item");
  const stack = def.stack || 64;
  if (amount <= 0) return;
  let remaining = amount;

  if (stack > 1 && quality >= 1) {
    // commodity: fold into existing compatible stacks
    const existing = await c.inventoryStack.findMany({
      where: { playerId, itemDef, amount: { lt: stack }, quality, durability },
    });
    for (const row of existing) {
      if (remaining <= 0) break;
      const space = stack - row.amount;
      const put = Math.min(space, remaining);
      await c.inventoryStack.update({ where: { id: row.id }, data: { amount: row.amount + put } });
      remaining -= put;
    }
  }

  while (remaining > 0) {
    const count = await c.inventoryStack.count({ where: { playerId } });
    if (count >= INVENTORY_CAPACITY) throw new Error("Inventory full");
    const put = Math.min(stack, remaining);
    await c.inventoryStack.create({
      data: { playerId, itemDef, amount: put, quality, durability, metadata: metadata || {} },
    });
    remaining -= put;
  }
  return true;
}

// Value of inventory at base market value (for net worth). Only counts
// non-equipment, non-crate items that have real value.
async function inventoryWorth(playerId) {
  const inv = await getInventory(playerId);
  let total = 0;
  for (const s of inv) {
    const def = BY_ID[s.itemDef];
    if (!def) continue;
    if (def.type === "crate") continue;
    // Asset value at 60% of base value to be conservative and avoid exploits.
    const effective = Math.floor(def.baseValue * 0.6 * s.quality);
    total += effective * s.amount;
  }
  return total;
}

// Consume a stackable item (e.g. eating food). Returns true/false.
async function consume(playerId, itemDef, qty = 1) {
  const has = await countItem(playerId, itemDef);
  if (has < qty) return false;
  await removeItem(playerId, itemDef, qty);
  return true;
}

module.exports = { getInventory, countItem, hasItem, removeItem, addItem, inventoryWorth, consume, INVENTORY_CAPACITY };
