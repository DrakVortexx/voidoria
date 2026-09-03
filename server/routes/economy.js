const express = require("express");
const { requireAuth } = require("../middleware/auth");
const economy = require("../services/economy");
const prisma = require("../db");

const router = express.Router();
router.use(requireAuth);

router.get("/balance", async (req, res) => {
  try {
    const balance = await economy.getBalanceNumber(req.player.id);
    res.json({ balance });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/transactions", async (req, res) => {
  try {
    const rows = await prisma.transaction.findMany({
      where: { OR: [{ senderId: req.player.id }, { receiverId: req.player.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(rows.map((t) => ({
      id: t.id, type: t.type, amount: Number(t.amount), reference: t.reference,
      createdAt: t.createdAt, senderId: t.senderId, receiverId: t.receiverId,
    })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/networth", async (req, res) => {
  try {
    const nw = await economy.netWorthOf(req.player.id);
    res.json({
      cash: Number(nw.cash),
      inventoryWorth: Number(nw.inventoryWorth),
      propertyWorth: Number(nw.propertyWorth),
      lockedMarketWorth: Number(nw.lockedMarketWorth),
      netWorth: Number(nw.netWorth),
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Pay another registered player directly (by display name).
router.post("/pay", async (req, res) => {
  try {
    const { toName, amount } = req.body;
    const amt = Math.trunc(Number(amount));
    if (!toName || amt <= 0) return res.status(400).json({ error: "Invalid payment" });
    const target = await prisma.playerProfile.findUnique({ where: { displayName: toName } });
    if (!target) return res.status(404).json({ error: "Player not found" });
    await economy.transfer(req.player.id, target.id, amt, "PLAYER_PAYMENT", `Paid ${toName}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
