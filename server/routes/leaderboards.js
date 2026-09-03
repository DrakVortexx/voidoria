const express = require("express");
const { requireAuth } = require("../middleware/auth");
const stats = require("../services/stats");
const economy = require("../services/economy");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const [richest, producers, traders, grinders, pvp] = await Promise.all([
      economy.richList(10),
      stats.leaderboard("itemsProduced", 10),
      stats.leaderboard("itemsSold", 10),
      stats.leaderboard("level", 10),
      stats.leaderboard("pvpRating", 10),
    ]);
    res.json({ richest, producers, traders, grinders, pvp });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
