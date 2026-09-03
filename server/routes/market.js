const express = require("express");
const { requireAuth } = require("../middleware/auth");
const market = require("../services/market");
const { ITEM, CATEGORIES } = require("../game/items");

const router = express.Router();
router.use(requireAuth);

router.get("/items", (req, res) => {
  res.json({ items: ITEM, categories: CATEGORIES });
});

router.get("/overview", async (req, res) => {
  try { res.json(await market.marketOverview()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/item/:itemDef", async (req, res) => {
  try {
    const summary = await market.summarize(req.params.itemDef);
    const history = await market.priceHistory(req.params.itemDef, 40);
    res.json({ ...summary, history });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/sell", async (req, res) => {
  try {
    const { itemDef, quantity, unitPrice } = req.body;
    const result = await market.placeSell(req.player.id, itemDef, Number(quantity), Number(unitPrice));
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/buy", async (req, res) => {
  try {
    const { itemDef, quantity, unitPrice } = req.body;
    const result = await market.placeBuy(req.player.id, itemDef, Number(quantity), Number(unitPrice));
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/cancel/:orderId", async (req, res) => {
  try { res.json(await market.cancelOrder(req.player.id, req.params.orderId)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/my", async (req, res) => {
  try { res.json(await market.myOrders(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
