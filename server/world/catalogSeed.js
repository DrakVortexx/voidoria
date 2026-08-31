function shopItemKey(itemId) {
  return "si_" + Buffer.from(itemId).toString("hex").slice(0, 24);
}

// Backwards-compatible alias used by the admin route.
const listingIdKey = shopItemKey;

// Default server-controlled shop catalog.
// Format: [itemId, displayName, category, buyPrice, sellPrice, enabled, stock]
// buyPrice -1  -> not buyable from the Shop
// sellPrice -1 -> not sellable to the Shop
// stock null   -> unlimited
const SHOP_ITEMS = [
  // ---- Blocks ----
  ["block:cobblestone", "Cobblestone", "Blocks", 2, 1, true, null],
  ["block:planks", "Planks", "Blocks", 3, 1, true, null],
  ["block:stone", "Stone", "Blocks", 4, 2, true, null],
  ["block:dirt", "Dirt", "Blocks", 1, 0, true, null],
  ["block:sand", "Sand", "Blocks", 2, 1, true, null],
  ["block:glass", "Glass", "Blocks", 10, 4, true, null],
  ["block:sandstone", "Sandstone", "Blocks", 3, 1, true, null],
  ["block:stasis_chamber", "Stasis Chamber", "Blocks", 5000, 2500, true, null],

  // ---- Ores ----
  ["block:coal_ore", "Coal Ore", "Ores", 40, 15, true, null],
  ["block:iron_ore", "Iron Ore", "Ores", 80, 30, true, null],
  ["block:gold_ore", "Gold Ore", "Ores", 140, 45, true, null],
  ["block:diamond_ore", "Diamond Ore", "Ores", 400, 120, true, null],
  ["block:void_ore", "Void Ore", "Ores", 800, 200, true, null],
  ["item:void_shard", "Void Shard", "Ores", 1000, 300, true, null],

  // ---- Farming ----
  ["block:wood", "Wood", "Farming", 5, 2, true, null],
  ["block:leaves", "Leaves", "Farming", 1, 0, true, null],
  ["block:cactus", "Cactus", "Farming", 6, 2, true, null],
  ["block:flower", "Flower", "Farming", 5, 1, true, null],

  // ---- Food ----
  ["item:apple", "Apple", "Food", 10, 3, true, null],
  ["item:bread", "Bread", "Food", 15, 5, true, null],
  ["item:cooked_beef", "Cooked Beef", "Food", 35, 14, true, null],

  // ---- Tools ----
  ["item:wood_pickaxe", "Wood Pickaxe", "Tools", 80, 20, true, null],
  ["item:stone_pickaxe", "Stone Pickaxe", "Tools", 200, 50, true, null],
  ["item:iron_pickaxe", "Iron Pickaxe", "Tools", 600, 140, true, null],
  ["item:diamond_pickaxe", "Diamond Pickaxe", "Tools", 1800, 450, true, null],
  ["item:wood_axe", "Wood Axe", "Tools", 80, 20, true, null],
  ["item:stone_axe", "Stone Axe", "Tools", 200, 50, true, null],
  ["item:iron_axe", "Iron Axe", "Tools", 600, 140, true, null],
  ["item:diamond_axe", "Diamond Axe", "Tools", 1800, 450, true, null],

  // ---- Combat ----
  ["item:wood_sword", "Wood Sword", "Combat", 100, 25, true, null],
  ["item:stone_sword", "Stone Sword", "Combat", 250, 60, true, null],
  ["item:iron_sword", "Iron Sword", "Combat", 700, 160, true, null],
  ["item:diamond_sword", "Diamond Sword", "Combat", 2200, 550, true, null],

  // ---- Miscellaneous ----
  ["item:coal", "Coal", "Miscellaneous", 30, 12, true, null],
  ["item:iron_ingot", "Iron Ingot", "Miscellaneous", 120, 40, true, null],
  ["item:gold_ingot", "Gold Ingot", "Miscellaneous", 200, 65, true, null],
  ["item:diamond", "Diamond", "Miscellaneous", 10000, 7500, true, null],
  ["item:void_totem", "Void Totem", "Miscellaneous", 25000, -1, true, null],
];

// Ordered category list for the shop UI.
const CATEGORIES = [
  { id: "Blocks", name: "Blocks" },
  { id: "Ores", name: "Ores" },
  { id: "Farming", name: "Farming" },
  { id: "Food", name: "Food" },
  { id: "Tools", name: "Tools" },
  { id: "Combat", name: "Combat" },
  { id: "Miscellaneous", name: "Miscellaneous" },
];

const DEFAULT_LISTINGS = SHOP_ITEMS.map(([itemId, displayName, category, buy, sell, enabled]) => [
  itemId, buy, sell, category.toLowerCase().replace(/\s/g, "_"), enabled,
]);

module.exports = { shopItemKey, listingIdKey, SHOP_ITEMS, CATEGORIES, DEFAULT_LISTINGS };
