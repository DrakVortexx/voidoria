const prisma = require("../db");
const inventory = require("./inventory");
const stats = require("./stats");

const LOOT = {
  COMMON: [
    { itemDef: "stone", min: 5, max: 20, weight: 30 },
    { itemDef: "wood", min: 5, max: 20, weight: 30 },
    { itemDef: "coal", min: 2, max: 10, weight: 20 },
    { itemDef: "wheat", min: 5, max: 15, weight: 10 },
    { itemDef: "coins", min: 25, max: 150, weight: 10 },
  ],
  RARE: [
    { itemDef: "iron_ore", min: 3, max: 10, weight: 25 },
    { itemDef: "copper_ore", min: 3, max: 10, weight: 25 },
    { itemDef: "gem", min: 1, max: 2, weight: 15 },
    { itemDef: "machinery", min: 1, max: 2, weight: 10 },
    { itemDef: "coins", min: 100, max: 500, weight: 20 },
    { itemDef: "blueprint", min: 1, max: 1, weight: 5 },
  ],
  EPIC: [
    { itemDef: "machinery", min: 2, max: 4, weight: 20 },
    { itemDef: "gem", min: 2, max: 5, weight: 25 },
    { itemDef: "electronics", min: 2, max: 5, weight: 20 },
    { itemDef: "blueprint", min: 1, max: 2, weight: 15 },
    { itemDef: "coins", min: 500, max: 1500, weight: 20 },
  ],
  LEGENDARY: [
    { itemDef: "gem", min: 5, max: 12, weight: 25 },
    { itemDef: "blueprint", min: 2, max: 4, weight: 25 },
    { itemDef: "crate_epic", min: 1, max: 1, weight: 15 },
    { itemDef: "coins", min: 1500, max: 4000, weight: 20 },
    { itemDef: "wagon", min: 1, max: 1, weight: 15 },
  ],
};

function roll(kind) {
  const table = LOOT[kind];
  const total = table.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) {
      if (entry.itemDef === "coins") {
        return { coins: entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1)) };
      }
      const qty = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
      return { itemDef: entry.itemDef, qty };
    }
  }
  return { coins: 10 };
}

// Award a crate to a player.
async function award(playerId, kind, source, { tx } = {}) {
  const c = tx || prisma;
  return c.crate.create({ data: { playerId, kind, source } });
}

async function myCrates(playerId) {
  return prisma.crate.findMany({ where: { playerId, status: "UNOPENED" }, orderBy: { createdAt: "desc" } });
}

// Open a crate and grant loot.
async function openCrate(playerId, crateId) {
  const crate = await prisma.crate.findUnique({ where: { id: crateId } });
  if (!crate || crate.playerId !== playerId) throw new Error("Crate not found");
  if (crate.status !== "UNOPENED") throw new Error("Crate already opened");
  const loot = roll(crate.kind);
  let coinsEarned = 0;
  let itemGrant = null;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.crate.updateMany({
      where: { id: crateId, status: "UNOPENED", playerId },
      data: { status: "OPENED" },
    });
    if (upd.count === 0) throw new Error("Crate already opened");
    if (loot.coins) {
      const economy = require("./economy");
      await economy.creditSystem(playerId, loot.coins, "CRATE", `Opened ${crate.kind} crate`, { tx });
      coinsEarned = loot.coins;
    } else {
      await inventory.addItem(playerId, loot.itemDef, loot.qty, { tx });
      itemGrant = { itemDef: loot.itemDef, qty: loot.qty };
    }
    await stats.addStat(playerId, "cratesOpened", 1, { tx });
  });
  return { kind: crate.kind, coins: coinsEarned, item: itemGrant };
}

module.exports = { award, myCrates, openCrate, roll };
