const express = require("express");
const { requireAuth } = require("../middleware/auth");
const business = require("../services/business");

const router = express.Router();
router.use(requireAuth);

router.get("/types", (req, res) => res.json({ types: business.TYPES }));

router.post("/create", async (req, res) => {
  try {
    const { name, type } = req.body;
    await business.create(req.player.id, name, type);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/my", async (req, res) => {
  try { res.json(await business.myBusinesses(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/:id/members", async (req, res) => {
  try { res.json(await business.members(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/:id/invite", async (req, res) => {
  try {
    const { playerId, role } = req.body;
    await business.invite(req.params.id, req.player.id, playerId, role);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/:id/remove", async (req, res) => {
  try {
    await business.removeMember(req.params.id, req.player.id, String(req.body.playerId));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
