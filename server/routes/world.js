const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const world = require("../services/world");
const inventory = require("../services/inventory");
const opportunity = require("../services/opportunity");

const router = express.Router();
router.use(requireAuth);

router.get("/regions", (req, res) => {
  res.json({
    regions: world.REGIONS.map((r) => ({
      key: r.key, name: r.name, kind: r.kind, x: r.x, y: r.y, radius: r.radius,
      resources: r.resources || [],
    })),
    bounds: world.WORLD_BOUNDS,
    spawn: world.spawnPoint(),
  });
});

router.get("/nodes", async (req, res) => {
  try {
    const x = Number(req.query.x) || 0;
    const y = Number(req.query.y) || 0;
    res.json(await world.nodesNear(x, y));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Server-authoritative movement. Validates movement speed, persists position,
// discovers regions, grants exploration rewards.
router.post("/move", async (req, res) => {
  try {
    const { x, y } = req.body;
    const nx = Number(x), ny = Number(y);
    const profile = req.player;
    const maxStep = 6; // max world-units per valid server turn
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return res.status(400).json({ error: "Invalid position" });
    const dx = nx - profile.posX, dy = ny - profile.posY;
    if (Math.hypot(dx, dy) > maxStep) return res.status(400).json({ error: "Movement too large" });
    const { minX, maxX, minY, maxY } = world.WORLD_BOUNDS;
    const clx = Math.max(minX, Math.min(maxX, nx));
    const cly = Math.max(minY, Math.min(maxY, ny));

    const region = world.regionAt(clx, cly);
    await prisma.playerProfile.update({
      where: { id: profile.id },
      data: { posX: clx, posY: cly, lastSeenAt: new Date() },
    });
    if (region) await opportunity.recordRegion(profile.id, region.key);
    res.json({ x: clx, y: cly, region: region?.name || "Unknown" });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/gather", async (req, res) => {
  try {
    const result = await world.gather(req.player.id, String(req.body.nodeId));
    const stats = require("../services/stats");
    await stats.addStat(req.player.id, "nodesGathered", 1);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
