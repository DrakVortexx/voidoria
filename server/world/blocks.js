const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  WOOD: 5,
  LEAVES: 6,
  SAND: 7,
  WATER: 8,
  PLANKS: 9,
  GLASS: 10,
  BEDROCK: 11,
  SNOW: 12,
  ICE: 13,
  SANDSTONE: 14,
  GRAVEL: 15,
  COAL_ORE: 16,
  IRON_ORE: 17,
  GOLD_ORE: 18,
  DIAMOND_ORE: 19,
  VOID_ORE: 20,
  VOID_SHARD_ORE: 21,
  VOID_STONE: 22,
  VOID_GRASS: 23,
  CACTUS: 24,
  FLOWER: 25,
  VOID_CORE: 26,
  STASIS_CHAMBER: 27,
};

const BLOCK_META = {};
function def(id, name, opts = {}) {
  BLOCK_META[id] = {
    id,
    name,
    solid: opts.solid !== false,
    opaque: opts.opaque !== false,
    hardness: opts.hardness ?? 1,
    drop: opts.drop ?? id,
    transparent: opts.transparent === true,
    tool: opts.tool || "any",
  };
}

def(BLOCK.AIR, "Air", { solid: false, opaque: false, transparent: true });
def(BLOCK.GRASS, "Grass Block", { drop: BLOCK.DIRT });
def(BLOCK.DIRT, "Dirt");
def(BLOCK.STONE, "Stone", { drop: BLOCK.COBBLESTONE, hardness: 3 });
def(BLOCK.COBBLESTONE, "Cobblestone", { hardness: 3 });
def(BLOCK.WOOD, "Oak Log", { hardness: 2, tool: "axe" });
def(BLOCK.LEAVES, "Leaves", { solid: false,opaque: false,transparent: false, hardness: 0.2 });
def(BLOCK.SAND, "Sand");
def(BLOCK.WATER, "Water", { solid: false, opaque: false, transparent: true });
def(BLOCK.PLANKS, "Oak Planks", { hardness: 2, tool: "axe" });
def(BLOCK.GLASS, "Glass", { solid: false, opaque: false, transparent: true, drop: BLOCK.AIR, hardness: 0.3 });
def(BLOCK.BEDROCK, "Bedrock", { hardness: -1 });
def(BLOCK.SNOW, "Snow Layer", { solid: false,opaque:false,transparent:false, hardness: 0.1, drop: BLOCK.AIR });
def(BLOCK.ICE, "Ice", { transparent: true, solid: false, drop: BLOCK.AIR, hardness: 0.5 });
def(BLOCK.SANDSTONE, "Sandstone", { hardness: 2 });
def(BLOCK.GRAVEL, "Gravel");
def(BLOCK.COAL_ORE, "Coal Ore", { hardness: 3, tool: "pickaxe" });
def(BLOCK.IRON_ORE, "Iron Ore", { hardness: 3, tool: "pickaxe" });
def(BLOCK.GOLD_ORE, "Gold Ore", { hardness: 3, tool: "pickaxe" });
def(BLOCK.DIAMOND_ORE, "Diamond Ore", { hardness: 3, tool: "pickaxe" });
def(BLOCK.VOID_ORE, "Void Ore", { hardness: 4, tool: "pickaxe" });
def(BLOCK.VOID_SHARD_ORE, "Void Shard Ore", { hardness: 4, tool: "pickaxe", drop: BLOCK.VOID_SHARD_ORE });
def(BLOCK.VOID_STONE, "Void Stone", { hardness: 5, tool: "pickaxe" });
def(BLOCK.VOID_GRASS, "Void Grass", { drop: BLOCK.VOID_STONE, hardness: 2 });
def(BLOCK.CACTUS, "Cactus", { hardness: 0.4 });
def(BLOCK.FLOWER, "Flower", { solid:false,opaque:false,transparent:false, hardness: 0 });
def(BLOCK.VOID_CORE, "Void Core", { hardness: -1 });
def(BLOCK.STASIS_CHAMBER, "Stasis Chamber", { hardness: 2, tool: "pickaxe" });

const NAME_TO_ID = {};
for (const id of Object.keys(BLOCK_META)) {
  NAME_TO_ID[BLOCK_META[id].name.toLowerCase()] = Number(id);
}

module.exports = { BLOCK, BLOCK_META, NAME_TO_ID, def };
