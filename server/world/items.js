const { BLOCK } = require("./blocks");

// itemType strings used in inventories/shop/auction.
const ITEMS = {
  // blocks (mineable/placeable) - itemType = "block:<name>"
  "block:dirt": { name: "Dirt", type: "block", block: BLOCK.DIRT, stack: 64, value: 1, sell: 0 },
  "block:grass": { name: "Grass Block", type: "block", block: BLOCK.GRASS, stack: 64, value: 1, sell: 0 },
  "block:stone": { name: "Stone", type: "block", block: BLOCK.STONE, stack: 64, value: 2, sell: 1 },
  "block:cobblestone": { name: "Cobblestone", type: "block", block: BLOCK.COBBLESTONE, stack: 64, value: 2, sell: 1 },
  "block:planks": { name: "Oak Planks", type: "block", block: BLOCK.PLANKS, stack: 64, value: 3, sell: 1 },
  "block:wood": { name: "Oak Log", type: "block", block: BLOCK.WOOD, stack: 64, value: 3, sell: 1 },
  "block:leaves": { name: "Leaves", type: "block", block: BLOCK.LEAVES, stack: 64, value: 0, sell: 0 },
  "block:sand": { name: "Sand", type: "block", block: BLOCK.SAND, stack: 64, value: 2, sell: 1 },
  "block:sandstone": { name: "Sandstone", type: "block", block: BLOCK.SANDSTONE, stack: 64, value: 3, sell: 1 },
  "block:gravel": { name: "Gravel", type: "block", block: BLOCK.GRAVEL, stack: 64, value: 2, sell: 1 },
  "block:glass": { name: "Glass", type: "block", block: BLOCK.GLASS, stack: 64, value: 10, sell: 4 },
  "block:coal_ore": { name: "Coal Ore", type: "block", block: BLOCK.COAL_ORE, stack: 64, value: 30, sell: 15 },
  "block:iron_ore": { name: "Iron Ore", type: "block", block: BLOCK.IRON_ORE, stack: 64, value: 60, sell: 30 },
  "block:gold_ore": { name: "Gold Ore", type: "block", block: BLOCK.GOLD_ORE, stack: 64, value: 90, sell: 45 },
  "block:diamond_ore": { name: "Diamond Ore", type: "block", block: BLOCK.DIAMOND_ORE, stack: 64, value: 240, sell: 120 },
  "block:void_ore": { name: "Void Ore", type: "block", block: BLOCK.VOID_ORE, stack: 64, value: 400, sell: 200 },
  "block:void_stone": { name: "Void Stone", type: "block", block: BLOCK.VOID_STONE, stack: 64, value: 60, sell: 30 },
  "block:void_grass": { name: "Void Grass", type: "block", block: BLOCK.VOID_GRASS, stack: 64, value: 60, sell: 30 },
  "block:cactus": { name: "Cactus", type: "block", block: BLOCK.CACTUS, stack: 64, value: 5, sell: 2 },
  "block:flower": { name: "Flower", type: "block", block: BLOCK.FLOWER, stack: 64, value: 4, sell: 1 },
  "block:stasis_chamber": { name: "Stasis Chamber", type: "block", block: BLOCK.STASIS_CHAMBER, stack: 16, value: 5000, sell: 2500 },

  // special items
  "item:coal": { name: "Coal", type: "item", stack: 64, value: 25, sell: 12 },
  "item:iron_ingot": { name: "Iron Ingot", type: "item", stack: 64, value: 80, sell: 40 },
  "item:gold_ingot": { name: "Gold Ingot", type: "item", stack: 64, value: 130, sell: 65 },
  "item:diamond": { name: "Diamond", type: "item", stack: 64, value: 300, sell: 150 },
  "item:void_shard": { name: "Void Shard", type: "item", stack: 64, value: 600, sell: 300 },
  "item:void_totem": { name: "Void Totem", type: "item", stack: 1, value: 15000, sell: 7500 },
  "item:apple": { name: "Apple", type: "food", stack: 64, value: 8, sell: 3 },
  "item:bread": { name: "Bread", type: "food", stack: 64, value: 12, sell: 5 },
  "item:cooked_beef": { name: "Cooked Beef", type: "food", stack: 64, value: 30, sell: 14 },
  "item:wood_pickaxe": { name: "Wooden Pickaxe", type: "tool", stack: 1, value: 50, sell: 20, toolPower: 1 },
  "item:stone_pickaxe": { name: "Stone Pickaxe", type: "tool", stack: 1, value: 120, sell: 50, toolPower: 2 },
  "item:iron_pickaxe": { name: "Iron Pickaxe", type: "tool", stack: 1, value: 300, sell: 140, toolPower: 3 },
  "item:diamond_pickaxe": { name: "Diamond Pickaxe", type: "tool", stack: 1, value: 900, sell: 450, toolPower: 4 },
  "item:wood_axe": { name: "Wooden Axe", type: "tool", stack: 1, value: 50, sell: 20, toolPower: 1 },
  "item:stone_axe": { name: "Stone Axe", type: "tool", stack: 1, value: 120, sell: 50, toolPower: 2 },
  "item:iron_axe": { name: "Iron Axe", type: "tool", stack: 1, value: 300, sell: 140, toolPower: 3 },
  "item:diamond_axe": { name: "Diamond Axe", type: "tool", stack: 1, value: 900, sell: 450, toolPower: 4 },
  "item:wood_sword": { name: "Wooden Sword", type: "weapon", stack: 1, value: 60, sell: 25, damage: 4 },
  "item:stone_sword": { name: "Stone Sword", type: "weapon", stack: 1, value: 140, sell: 60, damage: 6 },
  "item:iron_sword": { name: "Iron Sword", type: "weapon", stack: 1, value: 350, sell: 160, damage: 7 },
  "item:diamond_sword": { name: "Diamond Sword", type: "weapon", stack: 1, value: 1100, sell: 550, damage: 8 },
};

const CATALOG = ITEMS;

function getItem(itemType) {
  return ITEMS[itemType] || null;
}

function isBlockItem(itemType) {
  return itemType.startsWith("block:");
}

function placeableBlock(itemType) {
  return getItem(itemType)?.block ?? null;
}

module.exports = { ITEMS, CATALOG, getItem, isBlockItem, placeableBlock };
