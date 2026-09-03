const prisma = require("../db");

async function ensure(playerId, { tx } = {}) {
  const c = tx || prisma;
  const existing = await c.playerStat.findUnique({ where: { playerId } });
  if (existing) return existing;
  return c.playerStat.create({ data: { playerId } });
}

async function addStat(playerId, field, amount = 1, { tx } = {}) {
  const c = tx || prisma;
  await ensure(playerId, { tx: c });
  await c.playerStat.update({
    where: { playerId },
    data: { [field]: { increment: amount } },
  });
}

// Award XP and derive level (simple linear curve: level = floor(xp/100)+1).
async function addXp(playerId, xp, { tx } = {}) {
  const c = tx || prisma;
  const s = await ensure(playerId, { tx: c });
  const newXp = s.xp + xp;
  const newLevel = Math.floor(newXp / 100) + 1;
  await c.playerStat.update({ where: { playerId }, data: { xp: newXp, level: newLevel } });
  return { xp: newXp, level: newLevel, leveledUp: newLevel > s.level };
}

async function get(playerId) {
  const s = await prisma.playerStat.findUnique({ where: { playerId } });
  return s || { playerId, level: 1, xp: 0, kills: 0, deaths: 0, pvpRating: 1000 };
}

// Build generic leaderboard by a numeric field. Resolves display names.
async function leaderboard(field, limit = 10) {
  const rows = await prisma.playerStat.findMany({
    where: { [field]: { gt: 0 } },
    orderBy: { [field]: "desc" },
    take: limit,
    include: { player: { select: { displayName: true } } },
  });
  return rows.map((r, i) => ({ rank: i + 1, name: r.player.displayName, value: r[field] }));
}

module.exports = { ensure, addStat, addXp, get, leaderboard };
