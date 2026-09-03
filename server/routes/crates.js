const express = require("express");
const { requireAuth } = require("../middleware/auth");
const crates = require("../services/crates");

const router = express.Router();
router.use(requireAuth);

router.get("/my", async (req, res) => {
  try { res.json(await crates.myCrates(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/open", async (req, res) => {
  try {
    const result = await crates.openCrate(req.player.id, String(req.body.crateId));
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
