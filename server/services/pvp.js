const prisma = require("../db");
const economy = require("./economy");
const stats = require("./stats");

// Place a bounty on a target; funds are locked immediately.
async function placeBounty(playerId, targetId, amount, durationMs) {
  amount = Math.trunc(Number(amount));
  if (amount < 100) throw new Error("Bounty must be at least 100");
  if (playerId === targetId) throw new Error("Cannot place a bounty on yourself");

  await prisma.$transaction(async (tx) => {
    await economy.deduct(playerId, BigInt(amount), { tx });
    await economy.recordTransfer(playerId, null, BigInt(amount), "BOUNTY", `Bounty on ${targetId}`, { tx });
    await tx.bounty.create({
      data: {
        creatorId: playerId, targetId, amount: BigInt(amount),
        expiresAt: new Date(Date.now() + (durationMs || 7 * 24 * 3600 * 1000)),
      },
    });
  });
  return true;
}

// Bounties currently placed on a target (visible to the target).
async function onTarget(targetId) {
  return prisma.bounty.findMany({
    where: { targetId, status: "ACTIVE" },
    include: { creator: { select: { displayName: true } } },
  });
}

// Claim a bounty after defeating the target (player reports the kill).
async function claim(playerId, targetId, bountyId) {
  const bounty = await prisma.bounty.findUnique({ where: { id: bountyId } });
  if (!bounty || bounty.targetId !== targetId) throw new Error("Bounty not found");
  if (bounty.status !== "ACTIVE") throw new Error("Bounty already claimed");
  if (bounty.creatorId === playerId) throw new Error("Cannot claim your own bounty");
  if (playerId === targetId) throw new Error("Cannot claim your own bounty");

  await prisma.$transaction(async (tx) => {
    const upd = await tx.bounty.updateMany({
      where: { id: bountyId, status: "ACTIVE" },
      data: { status: "CLAIMED", claimedBy: playerId },
    });
    if (upd.count === 0) throw new Error("Bounty already claimed");
    await economy.creditSystem(playerId, bounty.amount, "BOUNTY", `Claimed bounty`, { tx });
    await stats.addStat(playerId, "kills", 1, { tx });
    await stats.addStat(targetId, "deaths", 1, { tx });
  });
  return Number(bounty.amount);
}

// Report an arena PvP result (server-authoritative in arena region).
async function recordArena(winnerId, loserId, rated) {
  let delta = 0;
  if (rated) {
    const w = await stats.get(winnerId);
    const l = await stats.get(loserId);
    delta = Math.max(1, Math.min(40, Math.round(32 / (1 + Math.pow(10, (Number(l.pvpRating) - Number(w.pvpRating)) / 400)))));
    await stats.addStat(winnerId, "pvpRating", delta);
    await stats.addStat(loserId, "pvpRating", -delta);
  }
  await stats.addStat(winnerId, "kills", 1);
  await stats.addStat(loserId, "deaths", 1);
  return { winnerDelta: delta };
}

module.exports = { placeBounty, onTarget, claim, recordArena };
