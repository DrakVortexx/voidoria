const express = require("express");
const { requireAuth } = require("../middleware/auth");
const transport = require("../services/transport");

const router = express.Router();
router.use(requireAuth);

router.post("/contract", async (req, res) => {
  try {
    const { fromRegion, toRegion, itemDef, quantity, reward } = req.body;
    const c = await transport.acceptContract(req.player.id, fromRegion, toRegion, itemDef, Number(quantity), Number(reward));
    res.json({ contract: c });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/contract/:id/deliver", async (req, res) => {
  try {
    const reward = await transport.deliverContract(req.player.id, req.params.id, String(req.body.region));
    res.json({ reward });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/contracts", async (req, res) => {
  try { res.json(await transport.myContracts(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/delivery", async (req, res) => {
  try {
    const { fromX, fromY, toX, toY, reward } = req.body;
    const d = await transport.acceptDelivery(req.player.id, Number(fromX), Number(fromY), Number(toX), Number(toY), Number(reward));
    res.json({ delivery: d });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/delivery/:id/deliver", async (req, res) => {
  try {
    const reward = await transport.deliver(req.player.id, req.params.id, Number(req.body.x), Number(req.body.y));
    res.json({ reward });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
