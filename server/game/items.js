// ============================================================================
// VOIDORIA — Item & production-chain definitions (server-authoritative data)
//
// Items flow through production chains:
//   RAW RESOURCE -> PROCESSED -> COMPONENT -> PRODUCT -> SHOP/EQUIPMENT/INFRA
//
// Each definition: { name, type, stack, baseValue, category, icon, recipe }
//   recipe -> array of { item, qty } consumed to produce `count` of this item.
//   A recipe may also require a facility kind (`facility`) and take time (ms).
// ============================================================================

const ITEM = {
  // ---------------- RAW RESOURCES (gathered from nodes) ----------------
  "wood":  { name: "Wood",      type: "resource", stack: 100, baseValue: 8,  category: "Timber",    icon: "🌲" },
  "stone": { name: "Stone",     type: "resource", stack: 100, baseValue: 6,  category: "Stone",     icon: "🪨" },
  "iron_ore": { name: "Iron Ore", type: "resource", stack: 100, baseValue: 25, category: "Mining",  icon: "⛏️" },
  "copper_ore": { name: "Copper Ore", type: "resource", stack: 100, baseValue: 20, category: "Mining", icon: "🟠" },
  "coal": { name: "Coal",       type: "resource", stack: 100, baseValue: 18, category: "Mining",    icon: "⬛" },
  "wheat": { name: "Wheat",     type: "resource", stack: 100, baseValue: 5,  category: "Agriculture", icon: "🌾" },
  "cotton": { name: "Cotton",   type: "resource", stack: 100, baseValue: 6,  category: "Agriculture", icon: "☁️" },
  "sand": { name: "Sand",       type: "resource", stack: 100, baseValue: 4,  category: "Stone",     icon: "🏖️" },
  "clay": { name: "Clay",       type: "resource", stack: 100, baseValue: 5,  category: "Stone",     icon: "🟤" },
  "water": { name: "Fresh Water", type: "resource", stack: 100, baseValue: 2, category: "Agriculture", icon: "💧" },
  "gold_ore": { name: "Gold Ore", type: "resource", stack: 100, baseValue: 40, category: "Mining",  icon: "✨" },
  "berries": { name: "Wild Berries", type: "food", stack: 100, baseValue: 4, category: "Food",     icon: "🫐" },

  // ---------------- PROCESSED (from a Workshop/Processing) ----------------
  "lumber":   { name: "Lumber",      type: "processed", stack: 100, baseValue: 16, category: "Timber",    icon: "🪵",
    recipe: [{ item: "wood", qty: 2 }], facility: "workshop", timeMs: 8000, producesPerJob: [1, 3] },
  "metal_parts": { name: "Iron Ingot", type: "processed", stack: 100, baseValue: 45, category: "Mining", icon: "🔩",
    recipe: [{ item: "iron_ore", qty: 2 }, { item: "coal", qty: 1 }], facility: "factory", timeMs: 12000, producesPerJob: [1, 2] },
  "copper":   { name: "Copper Ingot", type: "processed", stack: 100, baseValue: 38, category: "Mining", icon: "🥉",
    recipe: [{ item: "copper_ore", qty: 2 }], facility: "factory", timeMs: 10000, producesPerJob: [1, 2] },
  "glass":    { name: "Glass",       type: "processed", stack: 100, baseValue: 18, category: "Stone", icon: "🪟",
    recipe: [{ item: "sand", qty: 2 }, { item: "coal", qty: 1 }], facility: "factory", timeMs: 9000, producesPerJob: [1, 3] },
  "brick":    { name: "Brick",       type: "processed", stack: 100, baseValue: 12, category: "Stone", icon: "🧱",
    recipe: [{ item: "clay", qty: 2 }, { item: "water", qty: 1 }], facility: "workshop", timeMs: 8000, producesPerJob: [1, 3] },
  "flour":    { name: "Flour",       type: "processed", stack: 100, baseValue: 16, category: "Agriculture", icon: "🌫️",
    recipe: [{ item: "wheat", qty: 2 }], facility: "mill", timeMs: 7000, producesPerJob: [1, 3] },
  "thread":   { name: "Thread",      type: "processed", stack: 100, baseValue: 14, category: "Agriculture", icon: "🧵",
    recipe: [{ item: "cotton", qty: 2 }], facility: "workshop", timeMs: 7000, producesPerJob: [1, 3] },
  "fuel":     { name: "Fuel",        type: "processed", stack: 100, baseValue: 30, category: "Mining", icon: "⛽",
    recipe: [{ item: "coal", qty: 2 }], facility: "factory", timeMs: 6000, producesPerJob: [1, 1] },

  // ---------------- COMPONENTS ----------------
  "planks":   { name: "Planks",      type: "component", stack: 100, baseValue: 26, category: "Timber", icon: "🟫",
    recipe: [{ item: "lumber", qty: 1 }], facility: "workshop", timeMs: 6000, producesPerJob: [1, 4] },
  "metal_component": { name: "Metal Component", type: "component", stack: 100, baseValue: 70, category: "Mining", icon: "⚙️",
    recipe: [{ item: "metal_parts", qty: 2 }], facility: "factory", timeMs: 12000, producesPerJob: [1, 2] },
  "wiring":   { name: "Wiring",      type: "component", stack: 100, baseValue: 60, category: "Mining", icon: "🔌",
    recipe: [{ item: "copper", qty: 2 }], facility: "factory", timeMs: 9000, producesPerJob: [1, 3] },
  "fabric":   { name: "Fabric",      type: "component", stack: 100, baseValue: 40, category: "Agriculture", icon: "👕",
    recipe: [{ item: "thread", qty: 2 }], facility: "workshop", timeMs: 8000, producesPerJob: [1, 2] },

  // ---------------- PRODUCTS ----------------
  "furniture":    { name: "Furniture",     type: "product", stack: 20, baseValue: 140, category: "Timber", icon: "🛋️",
    recipe: [{ item: "planks", qty: 3 }, { item: "metal_component", qty: 1 }], facility: "workshop", timeMs: 18000, producesPerJob: [1, 2] },
  "machinery":    { name: "Machinery",     type: "product", stack: 10, baseValue: 320, category: "Mining", icon: "🏭",
    recipe: [{ item: "metal_component", qty: 3 }, { item: "wiring", qty: 1 }], facility: "factory", timeMs: 24000, producesPerJob: [1, 1] },
  "electronics":  { name: "Electronics",   type: "product", stack: 20, baseValue: 260, category: "Mining", icon: "📟",
    recipe: [{ item: "wiring", qty: 2 }, { item: "metal_component", qty: 1 }], facility: "factory", timeMs: 20000, producesPerJob: [1, 2] },
  "brick_block":  { name: "Brick Building Block", type: "product", stack: 50, baseValue: 40, category: "Stone", icon: "🧱",
    recipe: [{ item: "brick", qty: 2 }], facility: "workshop", timeMs: 10000, producesPerJob: [2, 4] },
  "glass_pane":   { name: "Glass Pane",    type: "product", stack: 50, baseValue: 55, category: "Stone", icon: "🪟",
    recipe: [{ item: "glass", qty: 2 }], facility: "factory", timeMs: 9000, producesPerJob: [2, 4] },

  // ---------------- FOOD ----------------
  "bread":    { name: "Bread",   type: "food", stack: 50, baseValue: 35, category: "Food", icon: "🍞",
    recipe: [{ item: "flour", qty: 2 }, { item: "water", qty: 1 }], facility: "workshop", timeMs: 8000, producesPerJob: [1, 3] },
  "jam":      { name: "Berry Jam", type: "food", stack: 50, baseValue: 45, category: "Food", icon: "🍓",
    recipe: [{ item: "berries", qty: 3 }, { item: "water", qty: 1 }], facility: "workshop", timeMs: 8000, producesPerJob: [1, 2] },

  // ---------------- TOOLS & EQUIPMENT (craftable, quality/durability/creator) ----------------
  "stone_pickaxe": { name: "Stone Pickaxe", type: "tool", stack: 1, baseValue: 120, category: "Equipment", icon: "⛏️",
    recipe: [{ item: "stone", qty: 3 }, { item: "lumber", qty: 2 }], facility: "workshop", timeMs: 10000, producesPerJob: [1, 1], durability: 1 },
  "iron_pickaxe":  { name: "Iron Pickaxe",  type: "tool", stack: 1, baseValue: 320, category: "Equipment", icon: "⛏️",
    recipe: [{ item: "metal_component", qty: 2 }, { item: "lumber", qty: 2 }], facility: "workshop", timeMs: 14000, producesPerJob: [1, 1], durability: 1 },
  "axe":           { name: "Axe",           type: "tool", stack: 1, baseValue: 200, category: "Equipment", icon: "🪓",
    recipe: [{ item: "metal_parts", qty: 2 }, { item: "lumber", qty: 2 }], facility: "workshop", timeMs: 12000, producesPerJob: [1, 1], durability: 1 },
  "wagon":         { name: "Cargo Wagon",   type: "vehicle", stack: 1, baseValue: 900, category: "Equipment", icon: "🛞",
    recipe: [{ item: "machinery", qty: 1 }, { item: "metal_component", qty: 2 }, { item: "planks", qty: 4 }], facility: "factory", timeMs: 30000, producesPerJob: [1, 1], durability: 1 },

  // ---------------- SPECIAL / RARE ----------------
  "gem":          { name: "Rare Gem",      type: "collectible", stack: 20, baseValue: 400, category: "Rare", icon: "💎" },
  "blueprint":    { name: "Blueprint",     type: "blueprint", stack: 5,  baseValue: 1500, category: "Rare", icon: "📜" },
  "crate_common":   { name: "Crate (Common)",   type: "crate", stack: 1, baseValue: 0, category: "Crates", icon: "📦" },
  "crate_rare":     { name: "Crate (Rare)",     type: "crate", stack: 1, baseValue: 0, category: "Crates", icon: "🎁" },
  "crate_epic":     { name: "Crate (Epic)",     type: "crate", stack: 1, baseValue: 0, category: "Crates", icon: "🎁" },
  "crate_legendary": { name: "Crate (Legendary)", type: "crate", stack: 1, baseValue: 0, category: "Crates", icon: "👑" },
};

// convenience lookup
const BY_ID = Object.fromEntries(Object.entries(ITEM).map(([k, v]) => [k, { id: k, ...v }]));

function getItem(id) {
  return BY_ID[id] || null;
}

function getCategory(category) {
  return Object.entries(ITEM)
    .filter(([, v]) => v.category === category)
    .map(([id, v]) => ({ id, ...v }));
}

// All known categories in display order
const CATEGORIES = ["Timber", "Stone", "Mining", "Agriculture", "Food", "Equipment", "Rare", "Crates"];

module.exports = { ITEM, BY_ID, getItem, getCategory, CATEGORIES };
