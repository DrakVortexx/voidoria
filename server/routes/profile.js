const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const profileService = require("../services/profile");

const router = express.Router();
router.use(requireAuth);

// Full dashboard snapshot.
router.get("/me", async (req, res) => {
  try {
    res.json(await profileService.snapshot(req.player.id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update appearance (customization).
router.post("/appearance", async (req, res) => {
  try {
    const appearance = req.body.appearance || {};
    const updated = await prisma.playerProfile.update({
      where: { id: req.player.id },
      data: { appearance },
    });
    res.json({ appearance: updated.appearance });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Set / change display name.
router.post("/display-name", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 24);
    if (!name) return res.status(400).json({ error: "Name required" });
    const updated = await prisma.playerProfile.update({
      where: { id: req.player.id },
      data: { displayName: name },
    });
    res.json({ displayName: updated.displayName });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/inventory", async (req, res) => {
  try {
    const rows = await require("../services/inventory").getInventory(req.player.id);
    res.json(rows.map((r) => ({
      id: r.id, itemDef: r.itemDef, amount: r.amount, quality: r.quality, durability: r.durability,
    })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
