const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { validateBody, toInt, isPosInt, isNonNegInt } = require("../middleware/validate");
const economy = require("../services/economy");

const router = express.Router();
router.use(requireAuth);

router.get("/bal", async (req, res) => {
  const balance = await economy.getBalanceNumber(req.player.id);
  res.json({ balance });
});

router.post("/pay", validateBody(["username", "amount"]), async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.body.username },
      include: { profile: true },
    });
    if (!target || !target.profile) return res.status(404).json({ error: "Player not found" });
    const amount = toInt(req.body.amount);
    if (!isPosInt(amount)) return res.status(400).json({ error: "Valid amount required" });

    const result = await economy.transfer(req.player.id, target.profile.id, amount, "PLAYER_PAYMENT", `Payment to ${req.body.username}`);
    res.json({ message: `Paid $${amount} to ${req.body.username}`, yourBalance: result.sender });
  } catch (err) {
    res.status(400).json({ error: err.message || "Payment failed" });
  }
});

router.get("/baltop", async (req, res) => {
  const top = await economy.baltop(10);
  res.json({ baltop: top });
});

module.exports = router;
