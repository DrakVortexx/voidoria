const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../db");
const social = require("../services/social");

const router = express.Router();
router.use(requireAuth);

// ----- Friends (User-level) -----
router.get("/friends", async (req, res) => {
  try { res.json(await social.friendList(req.user.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/friends/add", async (req, res) => {
  try {
    const { username } = req.body;
    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) return res.status(404).json({ error: "User not found" });
    await social.addFriend(req.user.id, target.id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/friends/accept", async (req, res) => {
  try {
    const { userId } = req.body;
    await social.acceptFriend(req.user.id, String(userId));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/friends/remove", async (req, res) => {
  try {
    const { userId } = req.body;
    await social.removeFriend(req.user.id, String(userId));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Find a player profile by display name (for trading / pvp).
router.get("/find/:name", async (req, res) => {
  try {
    const p = await prisma.playerProfile.findUnique({ where: { displayName: req.params.name } });
    if (!p) return res.status(404).json({ error: "Player not found" });
    res.json({ id: p.id, displayName: p.displayName });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ----- Trade offers -----
router.get("/offers", async (req, res) => {
  try { res.json(await social.myOffers(req.player.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/offer", async (req, res) => {
  try {
    const { targetId, offer, request } = req.body;
    await social.createOffer(req.player.id, String(targetId), offer || {}, request || {});
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/offer/:id/accept", async (req, res) => {
  try { await social.acceptOffer(req.player.id, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/offer/:id/decline", async (req, res) => {
  try { await social.declineOffer(req.player.id, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/offer/:id/cancel", async (req, res) => {
  try { await social.cancelOffer(req.player.id, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
