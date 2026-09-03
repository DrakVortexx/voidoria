const express = require("express");
const { requireAuth } = require("../middleware/auth");
const pvp = require("../services/pvp");
const prisma = require("../db");

const router = express.Router();
router.use(requireAuth);

router.get("/rating", async (req, res) => {
  try {
    const s = await require("../services/stats").get(req.player.id);
    res.json({ pvpRating: s.pvpRating, kills: s.kills, deaths: s.deaths });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/bounty", async (req, res) => {
  try {
    const { targetId, amount } = req.body;
    await pvp.placeBounty(req.player.id, String(targetId), Number(amount));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/bounties/on-me", async (req, res) => {
  try { res.json(await pvp.onTarget(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/bounty/claim", async (req, res) => {
  try {
    const { targetId, bountyId } = req.body;
    const reward = await pvp.claim(req.player.id, String(targetId), String(bountyId));
    res.json({ reward });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
