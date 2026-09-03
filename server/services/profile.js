const prisma = require("../db");
const inventory = require("./inventory");
const economy = require("./economy");
const stats = require("./stats");
const crates = require("./crates");
const world = require("./world");
const { STARTING_BALANCE } = require("../config");

// Starter kit granted to new players.
const STARTER = [
  { itemDef: "stone_pickaxe", qty: 1 },
  { itemDef: "axe", qty: 1 },
  { itemDef: "wood", qty: 20 },
  { itemDef: "stone", qty: 20 },
  { itemDef: "berries", qty: 10 },
];

// Ensure a brand-new player's first-expansion state exists (starter items,
// spending money, stats row, spawn). Called once after profile creation.
async function initializePlayer(playerId) {
  const hasStats = await prisma.playerStat.findUnique({ where: { playerId } });
  if (hasStats) return false; // already initialized

  await prisma.$transaction(async (tx) => {
    await prisma.playerStat.create({ data: { playerId } });
    for (const s of STARTER) {
      await inventory.addItem(playerId, s.itemDef, s.qty, { tx });
    }
    await economy.creditSystem(playerId, STARTING_BALANCE, "STARTING", "Starting funds", { tx });
    await crates.award(playerId, "COMMON", "START", { tx });
  });
  return true;
}

// Full profile snapshot used by the client dashboard.
async function snapshot(playerId) {
  const profile = await prisma.playerProfile.findUnique({
    where: { id: playerId },
    include: {
      stats: true,
      shop: { include: { plot: true, listings: true } },
      facilities: true,
    },
  });
  const inventoryRows = await inventory.getInventory(playerId);
  const money = await economy.getBalanceNumber(playerId);
  const { netWorth } = await economy.netWorthOf(playerId);
  const invWorth = await inventory.inventoryWorth(playerId);
  const cratesRows = await crates.myCrates(playerId);
  const offers = await prisma.tradeOffer.count({ where: { toId: playerId, status: "PENDING" } });

  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      appearance: profile.appearance,
      posX: profile.posX, posY: profile.posY,
      region: world.regionAt(profile.posX, profile.posY)?.name || "Unknown",
    },
    balance: money,
    netWorth: Number(netWorth),
    inventoryWorth: invWorth,
    stats: profile.stats || { level: 1, xp: 0 },
    inventory: inventoryRows.map((r) => ({
      id: r.id, itemDef: r.itemDef, amount: r.amount, quality: r.quality, durability: r.durability,
    })),
    crates: cratesRows.map((c) => ({ id: c.id, kind: c.kind, source: c.source })),
    pendingTrades: offers,
    shop: profile.shop,
  };
}

module.exports = { initializePlayer, snapshot, STARTER };
