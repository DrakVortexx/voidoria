const prisma = require("../db");
const crates = require("./crates");
const stats = require("./stats");
const economy = require("./economy");

// Opportunity system: milestone + exploration rewards that award XP, coins,
// and crates. Kept server-authoritative and conservative to avoid exploits.

const REWARDS = {
  explore_new_region:  { xp: 30, coins: 50 },
  first_trade:         { xp: 40, coins: 100 },
  first_sale:          { xp: 40, coins: 100 },
  first_gather:        { xp: 20, coins: 30 },
  first_production:    { xp: 50, coins: 120 },
  first_shop:          { xp: 60, coins: 150 },
  first_auction:       { xp: 40, coins: 80 },
  level_every_10:      { xp: 0,  coins: 200, crate: "RARE" },
};

// Track discovered regions for a player (stored in profile appearance meta to
// avoid a new table; only used to gate one-time rewards).
async function discovered(playerId) {
  const p = await prisma.playerProfile.findUnique({ where: { id: playerId }, select: { appearance: true } });
  return p?.appearance?.discoveredRegions || [];
}

async function recordRegion(playerId, regionKey) {
  const p = await prisma.playerProfile.findUnique({ where: { id: playerId }, select: { appearance: true } });
  const discoveredRegions = p?.appearance?.discoveredRegions || [];
  if (discoveredRegions.includes(regionKey)) return null;
  const r = REWARDS.explore_new_region;
  await prisma.playerProfile.update({
    where: { id: playerId },
    data: { appearance: { ...(p?.appearance || {}), discoveredRegions: [...discoveredRegions, regionKey] } },
  });
  await stats.addXp(playerId, r.xp);
  if (r.coins > 0) await economy.creditSystem(playerId, r.coins, "OPPORTUNITY", `Explored ${regionKey}`, {});
  return r;
}

async function grantMilestone(playerId, key) {
  const r = REWARDS[key];
  if (!r) return null;
  await stats.addXp(playerId, r.xp || 0);
  if (r.coins > 0) await economy.creditSystem(playerId, r.coins, "OPPORTUNITY", `Milestone: ${key}`, {});
  if (r.crate) await crates.award(playerId, r.crate, "MILESTONE");
  return r;
}

async function checkLevelMilestones(playerId) {
  const s = await stats.get(playerId);
  if (s.level >= 10 && s.level % 10 === 0) {
    const p = await prisma.playerProfile.findUnique({ where: { id: playerId }, select: { appearance: true } });
    const grantedLevels = p?.appearance?.grantedLevelRewards || [];
    if (!grantedLevels.includes(s.level)) {
      await prisma.playerProfile.update({
        where: { id: playerId },
        data: { appearance: { ...(p?.appearance || {}), grantedLevelRewards: [...grantedLevels, s.level] } },
      });
      return grantMilestone(playerId, "level_every_10");
    }
  }
  return null;
}

module.exports = { recordRegion, grantMilestone, checkLevelMilestones, discovered };
