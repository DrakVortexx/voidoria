const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { calculateLevelUp } = require("../services/game");
const { sanitizeString } = require("../middleware/validate");

const router = express.Router();

const JOBS = [
  { id: "blacksmith", name: "Blacksmith", description: "Forge weapons for the realm", levelReq: 1, baseCoins: 2, coinScale: 0.25, baseXp: 0.8, xpScale: 0.05 },
  { id: "herbalist", name: "Herbalist", description: "Gather rare ingredients from the wild", levelReq: 1, baseCoins: 2, coinScale: 0.3, baseXp: 0.9, xpScale: 0.05 },
  { id: "explorer", name: "Explorer", description: "Map ancient ruins and lost temples", levelReq: 5, baseCoins: 4, coinScale: 0.3, baseXp: 1.0, xpScale: 0.05 },
  { id: "merchant", name: "Merchant", description: "Trade goods in the bustling market", levelReq: 10, baseCoins: 5, coinScale: 0.4, baseXp: 1.1, xpScale: 0.06 },
  { id: "enchanter", name: "Enchanter", description: "Imbue items with dormant magic", levelReq: 20, baseCoins: 8, coinScale: 0.4, baseXp: 1.3, xpScale: 0.06 },
  { id: "assassin", name: "Assassin", description: "Complete secret contracts in the shadows", levelReq: 35, baseCoins: 12, coinScale: 0.5, baseXp: 1.5, xpScale: 0.07 },
  { id: "archmage", name: "Archmage", description: "Study forbidden knowledge beyond mortal reach", levelReq: 50, baseCoins: 18, coinScale: 0.6, baseXp: 1.8, xpScale: 0.08 },
  { id: "void_walker", name: "Void Walker", description: "Traverse dimensions and harvest void energy", levelReq: 75, baseCoins: 25, coinScale: 0.8, baseXp: 2.0, xpScale: 0.1 },
];

const MAX_SESSION_SECONDS = 8 * 60 * 60;
const DAILY_BASE = 25000;
const DAILY_PER_LEVEL = 2500;

function jobById(id) {
  return JOBS.find((j) => j.id === id) || null;
}

function coinRate(level, job) {
  const k = Math.max(level, 1);
  return Math.max(1, Math.floor(job.baseCoins + k * job.coinScale));
}

function xpRate(job, level) {
  const k = Math.max(level, 1);
  return job.baseXp + k * job.xpScale;
}

function dailyCap(level) {
  return DAILY_BASE + Math.max(1, level) * DAILY_PER_LEVEL;
}

function utcDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function currentDaily(player, now) {
  if (!player.jobDayReset || utcDayKey(player.jobDayReset) !== utcDayKey(now)) {
    return { earned: 0, rollover: now };
  }
  return { earned: player.jobEarnedToday || 0, rollover: player.jobDayReset };
}

function computeEarnings(player) {
  const job = jobById(player.activeJob);
  if (!job || !player.jobStartedAt) return null;

  const rawElapsed = Math.floor((Date.now() - player.jobStartedAt.getTime()) / 1000);
  const elapsed = Math.min(rawElapsed, MAX_SESSION_SECONDS);
  const rate = coinRate(player.level, job);
  const rateXp = xpRate(job, player.level);

  return {
    job: job.id,
    jobName: job.name,
    elapsed,
    capped: rawElapsed > MAX_SESSION_SECONDS,
    coinsEarned: elapsed * rate,
    xpEarned: Math.floor(elapsed * rateXp),
    rate,
    xpRate: Math.round(rateXp * 100) / 100,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.player.id } });
    if (!player) return res.status(404).json({ error: "Player not found" });

    const jobs = JOBS.map((j) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      levelReq: j.levelReq,
      unlocked: player.level >= j.levelReq,
      coinsPerSec: coinRate(player.level, j),
      xpPerSec: Math.round(xpRate(j, player.level) * 100) / 100,
    }));

    const daily = currentDaily(player, new Date());

    res.json({
      jobs,
      activeJob: player.activeJob,
      earnings: computeEarnings(player),
      daily: {
        cap: dailyCap(player.level),
        remaining: Math.max(0, dailyCap(player.level) - daily.earned),
      },
    });
  } catch (err) {
    console.error("Jobs list error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.post("/start", requireAuth, async (req, res) => {
  try {
    const jobId = sanitizeString(req.body.jobId, 32);
    if (!jobId) {
      return res.status(400).json({ error: "Job ID required" });
    }

    const job = jobById(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (req.player.level < job.levelReq) {
      return res.status(400).json({ error: `Level ${job.levelReq} required` });
    }

    if (req.player.activeJob) {
      return res.status(400).json({ error: "Already working. Stop current job first." });
    }

    const daily = currentDaily(req.player, new Date());
    if (dailyCap(req.player.level) - daily.earned <= 0) {
      return res.status(400).json({ error: "Daily job earnings reached. Come back tomorrow." });
    }

    await prisma.player.update({
      where: { id: req.player.id },
      data: {
        activeJob: jobId,
        jobStartedAt: new Date(),
      },
    });

    res.json({ message: `Started working as ${job.name}` });
  } catch (err) {
    console.error("Job start error:", err);
    res.status(500).json({ error: "Failed to start job" });
  }
});

async function settleJob(player, collect) {
  const earnings = computeEarnings(player);
  if (!earnings) return null;

  const startedAt = player.jobStartedAt;
  const now = new Date();
  const daily = currentDaily(player, now);
  const cap = dailyCap(player.level);
  const remaining = Math.max(0, cap - daily.earned);

  const coinsEarned = Math.min(earnings.coinsEarned, remaining);
  const xpEarned = earnings.xpEarned;
  const cappedByDaily = coinsEarned < earnings.coinsEarned;

  const levelResult = calculateLevelUp(player.level, player.xp, xpEarned);

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.player.updateMany({
      where: { id: player.id, jobStartedAt: startedAt },
      data: {
        coins: { increment: coinsEarned + levelResult.coinBonus },
        level: levelResult.level,
        xp: levelResult.xp,
        jobEarnedToday: daily.earned === 0 ? coinsEarned : { increment: coinsEarned },
        jobDayReset: now,
        ...(collect ? { jobStartedAt: now } : { activeJob: null, jobStartedAt: null }),
      },
    });

    if (claimed.count === 0) throw new Error("JOB_ALREADY_SETTLED");

    const updated = await tx.player.findUnique({ where: { id: player.id } });
    return { player: updated };
  });

  return { player: result.player, levelResult, coinsEarned, xpEarned, cappedByDaily };
}

router.post("/stop", requireAuth, async (req, res) => {
  try {
    if (!req.player.activeJob) {
      return res.status(400).json({ error: "No active job" });
    }

    const result = await settleJob(req.player, false);
    if (!result) {
      return res.status(400).json({ error: "No active job" });
    }

    res.json({
      message: `Job complete! Earned $${result.coinsEarned.toLocaleString()} and ${result.xpEarned} XP`,
      coins: result.player.coins,
      coinsEarned: result.coinsEarned,
      xpEarned: result.xpEarned,
      levelUp: result.levelResult.levelsGained > 0,
      newLevel: result.levelResult.level,
      coinBonus: result.levelResult.coinBonus,
      cappedByDaily: result.cappedByDaily,
    });
  } catch (err) {
    if (err && err.message === "JOB_ALREADY_SETTLED") {
      return res.status(409).json({ error: "Earnings were already collected" });
    }
    console.error("Job stop error:", err);
    res.status(500).json({ error: "Failed to stop job" });
  }
});

router.post("/collect", requireAuth, async (req, res) => {
  try {
    if (!req.player.activeJob || !req.player.jobStartedAt) {
      return res.status(400).json({ error: "No active job" });
    }

    const result = await settleJob(req.player, true);

    res.json({
      message: `Collected $${result.coinsEarned.toLocaleString()} and ${result.xpEarned} XP`,
      coins: result.player.coins,
      coinsEarned: result.coinsEarned,
      xpEarned: result.xpEarned,
      levelUp: result.levelResult.levelsGained > 0,
      newLevel: result.levelResult.level,
      coinBonus: result.levelResult.coinBonus,
      cappedByDaily: result.cappedByDaily,
    });
  } catch (err) {
    if (err && err.message === "JOB_ALREADY_SETTLED") {
      return res.status(409).json({ error: "Earnings were already collected" });
    }
    console.error("Job collect error:", err);
    res.status(500).json({ error: "Failed to collect earnings" });
  }
});

module.exports = router;