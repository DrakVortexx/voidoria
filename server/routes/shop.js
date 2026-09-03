const express = require("express");
const { requireAuth } = require("../middleware/auth");
const shop = require("../services/shop");

const router = express.Router();
router.use(requireAuth);

router.get("/plots", async (req, res) => {
  try { res.json(await shop.listPlots()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/purchase", async (req, res) => {
  try {
    const { plotKey, name } = req.body;
    const s = await shop.purchasePlot(req.player.id, plotKey, name);
    res.json({ shop: s });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/my", async (req, res) => {
  try { res.json(await shop.getMyShop(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/customize", async (req, res) => {
  try {
    const { name, sign, shopkeeper, interior } = req.body;
    res.json(await shop.customizeShop(req.player.id, { name, sign, shopkeeper, interior }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/listing", async (req, res) => {
  try {
    const { itemDef, quantity, price } = req.body;
    await shop.addListing(req.player.id, itemDef, Number(quantity), Number(price));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/listing/:id", async (req, res) => {
  try { await shop.removeListing(req.player.id, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/buy/:listingId", async (req, res) => {
  try {
    await shop.purchase(req.player.id, req.params.listingId, Number(req.body.quantity) || 1);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/all", async (req, res) => {
  try { res.json(await shop.allShops()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
