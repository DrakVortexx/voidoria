const express = require("express");
const { requireAuth } = require("../middleware/auth");
const building = require("../services/building");

const router = express.Router();
router.use(requireAuth);

router.get("/kinds", (req, res) => res.json({ kinds: building.KINDS }));

router.post("/buy-property", async (req, res) => {
  try {
    const { regionKey, kind, name, x, y, sizeW, sizeH } = req.body;
    const p = await building.buyProperty(req.player.id, regionKey, kind, name || "Property", Number(x) || 0, Number(y) || 0, Number(sizeW) || 2, Number(sizeH) || 2);
    res.json({ property: p });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/my-properties", async (req, res) => {
  try { res.json(await building.myProperties(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/build", async (req, res) => {
  try {
    const { propertyId, kind, name, x, y } = req.body;
    const b = await building.build(req.player.id, String(propertyId), kind, name || "Building", Number(x) || 0, Number(y) || 0);
    res.json({ building: b });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
