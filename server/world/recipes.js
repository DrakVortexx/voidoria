const RECIPES = {
  void_totem: {
    name: "Void Totem",
    result: "item:void_totem",
    count: 1,
    cost: { "item:void_shard": 8, "item:diamond": 1 },
  },
  planks: {
    name: "Oak Planks",
    result: "block:planks",
    count: 4,
    cost: { "block:wood": 1 },
  },
  stone_pickaxe: {
    name: "Stone Pickaxe",
    result: "item:stone_pickaxe",
    count: 1,
    cost: { "block:cobblestone": 3, "block:planks": 2 },
  },
  stone_sword: {
    name: "Stone Sword",
    result: "item:stone_sword",
    count: 1,
    cost: { "block:cobblestone": 2, "block:planks": 1 },
  },
};

module.exports = { RECIPES };
