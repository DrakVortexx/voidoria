const express = require("express");
const { requireAuth } = require("../middleware/auth");
const production = require("../services/production");
const business = require("../services/business");

const router = express.Router();
router.use(requireAuth);

// Recipes a facility type can process.
router.get("/recipes/:kind", (req, res) => {
  res.json({ recipes: production.recipesForFacility(String(req.params.kind).toUpperCase()) });
});

// Create a facility (solo player owned).
router.post("/facility", async (req, res) => {
  try {
    const { kind, name, x, y } = req.body;
    const f = await production.createFacility(req.player.id, kind, name, Number(x) || 0, Number(y) || 0);
    res.json({ facility: f });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Start a production job.
router.post("/start", async (req, res) => {
  try {
    const { facilityId, recipeKey, batches } = req.body;
    const result = await production.start(String(facilityId), req.player.id, String(recipeKey), Number(batches) || 1);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Poll/finalize running jobs (zero-downtime completion), then list.
router.get("/jobs", async (req, res) => {
  try {
    const completed = await production.poll(req.player.id);
    const jobs = await production.myJobs(req.player.id);
    res.json({ completed, jobs });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
