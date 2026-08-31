function listingIdKey(itemType) {
  return "li_" + Buffer.from(itemType).toString("hex").slice(0, 24);
}

const CATEGORIES = [
  { id: "blocks", name: "Blocks" },
  { id: "ores", name: "Ores" },
  { id: "farming", name: "Farming" },
  { id: "food", name: "Food" },
  { id: "tools", name: "Tools" },
  { id: "combat", name: "Combat" },
  { id: "misc", name: "Miscellaneous" },
];

// default shop stock (buy=sell -1 means unavailable for that direction)
const DEFAULT_LISTINGS = [
  ["block:cobblestone", 2, 1, "blocks", true],
  ["block:planks", 3, 1, "blocks", true],
  ["block:stone", 4, 2, "blocks", true],
  ["block:dirt", 1, 0, "blocks", true],
  ["block:sand", 2, 1, "blocks", true],
  ["block:glass", 10, 4, "blocks", true],
  ["block:sandstone", 3, 1, "blocks", true],
  ["block:stasis_chamber", 5000, 2500, "misc", true],

  ["block:coal_ore", 40, 15, "ores", true],
  ["block:iron_ore", 80, 30, "ores", true],
  ["block:gold_ore", 140, 45, "ores", true],
  ["block:diamond_ore", 400, 120, "ores", true],
  ["block:void_ore", 800, 200, "ores", true],
  ["item:void_shard", 1000, 300, "ores", true],

  ["block:wood", 5, 2, "farming", true],
  ["block:leaves", 1, 0, "farming", true],
  ["block:cactus", 6, 2, "farming", true],
  ["block:flower", 5, 1, "farming", true],

  ["item:apple", 10, 3, "food", true],
  ["item:bread", 15, 5, "food", true],
  ["item:cooked_beef", 35, 14, "food", true],

  ["item:wood_pickaxe", 80, 20, "tools", true],
  ["item:stone_pickaxe", 200, 50, "tools", true],
  ["item:iron_pickaxe", 600, 140, "tools", true],
  ["item:diamond_pickaxe", 1800, 450, "tools", true],
  ["item:wood_axe", 80, 20, "tools", true],
  ["item:stone_axe", 200, 50, "tools", true],
  ["item:iron_axe", 600, 140, "tools", true],
  ["item:diamond_axe", 1800, 450, "tools", true],

  ["item:wood_sword", 100, 25, "combat", true],
  ["item:stone_sword", 250, 60, "combat", true],
  ["item:iron_sword", 700, 160, "combat", true],
  ["item:diamond_sword", 2200, 550, "combat", true],

  ["item:coal", 30, 12, "misc", true],
  ["item:iron_ingot", 120, 40, "misc", true],
  ["item:gold_ingot", 200, 65, "misc", true],
  ["item:diamond", 500, 150, "misc", true],
  ["item:void_totem", 25000, -1, "misc", true],
];

module.exports = { listingIdKey, CATEGORIES, DEFAULT_LISTINGS };
