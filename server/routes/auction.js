const express = require("express");
const { requireAuth } = require("../middleware/auth");
const auction = require("../services/auction");

const router = express.Router();
router.use(requireAuth);

router.get("/active", async (req, res) => {
  try { res.json(await auction.active()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/create", async (req, res) => {
  try {
    const { itemDef, quantity, startPrice, buyoutPrice, durationMs } = req.body;
    await auction.create(req.player.id, itemDef, Number(quantity), Number(startPrice), buyoutPrice ? Number(buyoutPrice) : null, Number(durationMs) || 0);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/bid/:auctionId", async (req, res) => {
  try {
    res.json(await auction.bid(req.player.id, req.params.auctionId, Number(req.body.amount)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/buyout/:auctionId", async (req, res) => {
  try { await auction.buyout(req.player.id, req.params.auctionId); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
