const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { RECIPES } = require("../world/recipes");
const inventory = require("../services/inventory");
const { ITEMS } = require("../world/items");
const { OVERWORLD, VOID, WORLD_BORDER, WORLD_HEIGHT } = require("../world/terrain");

const router = express.Router();
router.use(requireAuth);

// Catalog of items for the client (blocks + items metadata)
router.get("/catalog", async (req, res) => {
  const catalog = {};
  for (const [key, it] of Object.entries(ITEMS)) {
    catalog[key] = { name: it.name, type: it.type, stack: it.stack, value: it.value, sell: it.sell, toolPower: it.toolPower, damage: it.damage };
  }
  res.json({ catalog, worldBorder: WORLD_BORDER, worldHeight: WORLD_HEIGHT, recipes: RECIPES });
});

// Travel between dimensions. Entering the Void requires a Void Totem.
router.post("/travel", async (req, res) => {
  try {
    const dimension = String(req.body.dimension || "").slice(0, 40);
    const gameServer = req.app.locals.gameServer;
    if (![OVERWORLD, VOID].includes(dimension)) {
      return res.status(400).json({ error: "Unknown dimension" });
    }
    if (dimension === (req.player.dimension || OVERWORLD)) {
      return res.status(400).json({ error: "Already in that dimension" });
    }

    if (dimension === VOID) {
      // require a Void Totem to enter the Void
      const hasTotem = await inventory.hasItem(req.player.id, "item:void_totem", 1);
      if (!hasTotem) {
        return res.status(400).json({ error: "You need a Void Totem in your inventory to survive the Void. Craft one from Void Shards." });
      }
    }

    const pos = dimension === VOID
      ? { x: 8.5, y: 60, z: 8.5, dimension: VOID }
      : { x: 8.5, y: 70, z: 8.5, dimension: OVERWORLD };

    if (gameServer) {
      gameServer.teleportPlayer(req.user.id, pos);
    } else {
      await prisma.playerProfile.update({ where: { id: req.player.id }, data: { dimension, posX: pos.x, posY: pos.y, posZ: pos.z } });
    }
    res.json({ position: pos, message: dimension === VOID ? "You step into the Void. Your Void Totem hums anxiously." : "You return to the Overworld." });
  } catch (err) {
    res.status(500).json({ error: err.message || "Travel failed" });
  }
});

// Crafting (Void Shards -> Void Totem, etc.)
router.post("/craft", async (req, res) => {
  try {
    const recipeId = String(req.body.recipe || "");
    const recipe = RECIPES[recipeId];
    if (!recipe) return res.status(400).json({ error: "Unknown recipe" });

    // validate inputs
    for (const [itemType, needed] of Object.entries(recipe.cost)) {
      const has = await inventory.hasItem(req.player.id, itemType, needed);
      if (!has) return res.status(400).json({ error: `Missing ingredient: ${itemType} x${needed}` });
    }
    // remove cost then grant
    for (const [itemType, needed] of Object.entries(recipe.cost)) {
      await inventory.removeItem(req.player.id, itemType, needed);
    }
    await inventory.addItem(req.player.id, recipe.result, recipe.count || 1);
    res.json({ message: `Crafted ${recipe.count || 1} x ${recipe.result}`, result: recipe.result, count: recipe.count || 1 });
  } catch (err) {
    res.status(400).json({ error: err.message || "Crafting failed" });
  }
});

router.get("/void/source", async (req, res) => {
  res.json({
    info: "Void Shards are mined from Void Shard Ore in The Void dimension. Craft a Void Totem from 8 Void Shards to survive Void hazards.",
  });
});

module.exports = router;
