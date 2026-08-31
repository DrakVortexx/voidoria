const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sanitizeString } = require("../middleware/validate");
const inventory = require("../services/inventory");
const tp = require("../services/teleport");

const router = express.Router();
router.use(requireAuth);

// Place a stasis chamber at current-ish location
router.post("/place", async (req, res) => {
  try {
    const x = Number(req.body.x), y = Number(req.body.y), z = Number(req.body.z);
    const dimension = String(req.body.dimension || "overworld").slice(0, 40);
    const name = sanitizeString(String(req.body.name || "Chamber"), 40) || "Chamber";
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return res.status(400).json({ error: "Valid coordinates required" });
    }
    const count = await prisma.stasisChamber.count({ where: { ownerId: req.user.id } });
    if (count >= 3) return res.status(400).json({ error: "You can only maintain 3 Stasis Chambers" });

    const chamber = await prisma.stasisChamber.create({
      data: { ownerId: req.user.id, name, x, y, z, dimension, active: true },
    });
    res.json({ message: `Stasis Chamber '${name}' placed`, chamber: toPubic(chamber) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to place chamber" });
  }
});

router.get("", async (req, res) => {
  const chambers = await prisma.stasisChamber.findMany({ where: { ownerId: req.user.id } });
  res.json({ chambers: chambers.map(toPubic) });
});

router.post("/toggle", async (req, res) => {
  const id = String(req.body.id || "");
  const c = await prisma.stasisChamber.findFirst({ where: { id, ownerId: req.user.id } });
  if (!c) return res.status(404).json({ error: "Chamber not found" });
  const updated = await prisma.stasisChamber.update({ where: { id: c.id }, data: { active: !c.active } });
  res.json({ message: updated.active ? "Chamber activated" : "Chamber deactivated", chamber: toPubic(updated) });
});

// Pull a target player to the chamber (owner only, with cooldown)
router.post("/pull", async (req, res) => {
  try {
    const id = String(req.body.id || "");
    const { sanitizeString } = require("../middleware/validate");
    const targetName = sanitizeString(String(req.body.targetName || ""), 20);
    const targetUserId = String(req.body.targetUserId || "");
    const c = await prisma.stasisChamber.findFirst({ where: { id, ownerId: req.user.id } });
    if (!c) return res.status(404).json({ error: "Chamber not found" });
    if (!c.active) return res.status(400).json({ error: "This chamber is inactive" });

    // cooldown on pull
    const remaining = await tp.getCooldown(req.user.id, "stasis_pull");
    if (remaining > 0) {
      return res.status(429).json({ error: `Pull on cooldown (${Math.ceil(remaining / 1000)}s)` });
    }

    // Resolve target by username (canonical) or by explicit id.
    const target = targetUserId
      ? await prisma.user.findUnique({ where: { id: targetUserId }, include: { profile: true } })
      : await prisma.user.findUnique({ where: { username: targetName }, include: { profile: true } });
    if (!target || !target.profile) return res.status(404).json({ error: "Target player not found" });

    const gameServer = req.app.locals.gameServer;
    if (!gameServer || !gameServer.players?.has(target.id)) {
      return res.status(400).json({ error: "Target player is not online" });
    }

    // validate distance if same dimension (chamber reach)
    const targetC = gameServer.players.get(target.id);
    const inRange = targetC.dimension === c.dimension
      ? Math.hypot(targetC.x - c.x, targetC.z - c.z, targetC.y - c.y) <= 120
      : true; // cross-dimension rescue always allowed (core mechanic)
    if (!inRange) return res.status(400).json({ error: "Target is out of chamber range" });
    if (targetC.invulnerableUntil > Date.now()) return res.status(400).json({ error: "Target is invulnerable" });

    await tp.setCooldown(req.user.id, "stasis_pull", 60000);
    await prisma.stasisChamber.update({ where: { id: c.id }, data: { lastPullAt: new Date() } });

    gameServer.teleportPlayer(target.id, { x: c.x, y: c.y + 0.5, z: c.z, dimension: c.dimension });

    res.json({ message: `${target.username} pulled to '${c.name}'`, pulled: target.id });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to pull" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const c = await prisma.stasisChamber.findFirst({ where: { id, ownerId: req.user.id } });
  if (!c) return res.status(404).json({ error: "Chamber not found" });
  await prisma.stasisChamber.delete({ where: { id: c.id } });
  res.json({ message: "Chamber removed" });
});

function toPubic(c) {
  return { id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, dimension: c.dimension, active: c.active, lastPullAt: c.lastPullAt };
}

module.exports = router;
