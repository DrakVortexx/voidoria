const { createNoise2D, createNoise3D } = require("simplex-noise");
const { mulberry32 } = require("./random");
const { BLOCK } = require("./blocks");

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 128;
const WORLD_BORDER = 5000; // -5000..+5000 on X and Z
const BEDROCK_LEVEL = 0;

// dimensions
const OVERWORLD = "overworld";
const VOID = "void";

function makeNoise(seed, label) {
  return createNoise2D(mulberry32(hashSeed(seed, label)));
}
function makeNoise3(seed, label) {
  return createNoise3D(mulberry32(hashSeed(seed, label)));
}
function hashSeed(seed, label) {
  let h = 2166136261;
  const s = String(seed) + "::" + label;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fbm(n, x, z, octaves, lacunarity, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * n(x * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

class TerrainGenerator {
  constructor({ seed, dimension = OVERWORLD }) {
    this.seed = seed;
    this.dimension = dimension;
    if (dimension === VOID) {
      this.elev = makeNoise(seed, "void-elev");
      this.rough = makeNoise(seed, "void-rough");
      this.decor = makeNoise(seed, "void-decor");
      this.oreN = makeNoise3(seed, "void-ore");
      this.mountains = makeNoise(seed, "void-mountains");
    } else {
      this.height = makeNoise(seed, "height");
      this.heightDetail = makeNoise(seed, "height-detail");
      this.temp = makeNoise(seed, "temp");
      this.humidity = makeNoise(seed, "humidity");
      this.mountain = makeNoise(seed, "mountain");
      this.river = makeNoise(seed, "river");
      this.cave = makeNoise3(seed, "cave");
      this.ore = makeNoise3(seed, "ore");
    }
  }

  biomeAt(x, z) {
    const temp = fbm(this.temp, x / 600, z / 600, 3, 2, 0.5);
    const hum = fbm(this.humidity, x / 600, z / 600, 3, 2, 0.5);
    return { temp, hum };
  }

  heightAt(x, z) {
    const base = fbm(this.height, x / 800, z / 800, 4, 2, 0.5);   // -1..1 macro
    const detail = fbm(this.heightDetail, x / 130, z / 130, 3, 2, 0.5);
    const mount = Math.max(0, fbm(this.mountain, x / 500, z / 500, 3, 2, 0.5) * 0.9 + 0.1);
    const river = Math.abs(fbm(this.river, x / 220, z / 220, 2, 2, 0.5));

    let e = 62 + base * 22 + detail * 6;
    const mountainBias = mount * mount * 40;
    e += mountainBias;

    // carve rivers
    const riverness = Math.max(0, 0.14 - river);
    e -= riverness * 9;

    e = Math.max(2, Math.min(110, Math.floor(e)));

    const biome = this.biomeAt(x, z);
    if (biome.temp < -0.25) e -= 2;
    if (biome.temp > 0.4 && biome.hum < 0.1 && river < 0.1) e -= 4;

    return Math.floor(e);
  }

  voidHeightAt(x, z) {
    // The Void: floating shards of void stone with a broken floor
    const base = fbm(this.elev, x / 600, z / 600, 4, 2, 0.5);
    const rough = fbm(this.rough, x / 160, z / 160, 3, 2, 0.5);
    let floorY = 20 + base * 14 + rough * 4;
    return { floorY: Math.floor(floorY), island: Math.abs(base) > 0.12 };
  }

  inCave(x, y, z) {
    const n = this.cave(x / 24, y / 22, z / 24);
    const w = 0.18;
    return n < -w;
  }

  generateChunk(cx, cz) {
    if (this.dimension === VOID) {
      return this._generateVoidChunk(cx, cz);
    }
    return this._generateOverworldChunk(cx, cz);
  }

  _generateOverworldChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT).fill(BLOCK.AIR);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;

        if (wx < -WORLD_BORDER || wx > WORLD_BORDER || wz < -WORLD_BORDER || wz > WORLD_BORDER) {
          // outside border: void out the column (bedrock floor)
          blocks[yIndex(lx, 0, lz)] = BLOCK.BEDROCK;
          continue;
        }

        const surface = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz);
        const isRiver = Math.abs(fbm(this.river, wx / 220, wz / 220, 2, 2, 0.5)) < 0.14;

        let topBlock = BLOCK.GRASS;
        if (biome.temp > 0.4 && biome.hum < 0.2 && !isRiver) {
          topBlock = BLOCK.SAND;
        } else if (biome.temp < -0.25) {
          topBlock = BLOCK.SNOW;
        }

        let waterLevel = -1;
        if (isRiver && surface < 58) waterLevel = 56;
        if (biome.temp > 0.4 && surface < 60) waterLevel = 58; // warm shallow

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (y === 0) {
            blocks[yIndex(lx, 0, lz)] = BLOCK.BEDROCK;
          } else if (y < surface) {
            if (y === surface - 1) {
              blocks[yIndex(lx, y, lz)] = topBlock;
            } else if (y >= surface - 4 && topBlock === BLOCK.SAND) {
              blocks[yIndex(lx, y, lz)] = BLOCK.SAND;
            } else if (y >= surface - 3) {
              blocks[yIndex(lx, y, lz)] = BLOCK.DIRT;
            } else {
              if (this.inCave(wx, y, wz)) {
                blocks[yIndex(lx, y, lz)] = BLOCK.AIR;
              } else {
                blocks[yIndex(lx, y, lz)] = BLOCK.STONE;
              }
            }
          } else if (y <= waterLevel) {
            blocks[yIndex(lx, y, lz)] = BLOCK.WATER;
          }
        }

        // ore veins
        this._placeOres(blocks, lx, lz, wx, wz, surface);

        // decoration
        this._placeDecoration(blocks, lx, lz, wx, wz, surface, biome, isRiver);
      }
    }
    return blocks;
  }

  _placeOres(blocks, lx, lz, wx, wz, surface) {
    const rng = mulberry32(hashSeed(this.seed, `ore-${wx}-${wz}`));
    // coal & iron common
    const ores = [
      { id: BLOCK.COAL_ORE, min: 8, max: surface - 4, w: 0.55, count: 3 },
      { id: BLOCK.IRON_ORE, min: 6, max: 40, w: 0.35, count: 2 },
      { id: BLOCK.GOLD_ORE, min: 8, max: 30, w: 0.15, count: 1 },
      { id: BLOCK.DIAMOND_ORE, min: 6, max: 16, w: 0.08, count: 1 },
      { id: BLOCK.VOID_ORE, min: 8, max: 26, w: 0.04, count: 1 },
    ];
    for (const ore of ores) {
      let placed = 0;
      for (let a = 0; a < 60 && placed < ore.count; a++) {
        if (rng() < ore.w) {
          const y = ore.min + Math.floor(rng() * (ore.max - ore.min));
          const idx = yIndex(lx, y, lz);
          if (blocks[idx] === BLOCK.STONE) {
            blocks[idx] = ore.id;
            placed++;
          }
        }
      }
    }
  }

  _placeDecoration(blocks, lx, lz, wx, wz, surface, biome, isRiver) {
    if (isRiver) return;
    const rng = mulberry32(hashSeed(this.seed, `decor-${wx}-${wz}`));
    const r = rng();
    const topIdx = yIndex(lx, surface, lz);
    const top = blocks[topIdx];

    if (top === BLOCK.SAND) {
      if (r < 0.05 && blocks[yIndex(lx, surface - 1, lz)] === BLOCK.SAND) {
        for (let h = 1; h <= 2 + Math.floor(rng() * 2); h++) {
          if (surface + h < WORLD_HEIGHT) blocks[yIndex(lx, surface + h, lz)] = BLOCK.CACTUS;
        }
      }
      return;
    }
    if (top === BLOCK.SNOW) return;
    if (top === BLOCK.GRASS) {
      if (biome.hum > 0.25) {
        if (r < 0.22) {
          // tree
          this._placeTree(blocks, lx, lz, surface, rng);
        } else if (r < 0.3) {
          if (surface + 1 < WORLD_HEIGHT) blocks[yIndex(lx, surface + 1, lz)] = BLOCK.FLOWER;
        }
      } else if (r < 0.04 && surface + 1 < WORLD_HEIGHT) {
        blocks[yIndex(lx, surface + 1, lz)] = BLOCK.FLOWER;
      }
    }
  }

  _placeTree(blocks, lx, lz, surface, rng) {
    const trunkH = 4 + Math.floor(rng() * 3);
    for (let h = 1; h <= trunkH; h++) {
      const y = surface + h;
      if (y >= WORLD_HEIGHT) return;
      const idx = yIndex(lx, y, lz);
      if (blocks[idx] === BLOCK.AIR) blocks[idx] = BLOCK.WOOD;
    }
    const top = surface + trunkH;
    const leafStart = top - 2;
    for (let dy = 0; dy <= 2; dy++) {
      const y = leafStart + dy;
      if (y >= WORLD_HEIGHT) break;
      const rad = dy === 2 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > rad * 2 && dy < 2) continue;
          const nx = lx + dx, nz = lz + dz;
          if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue;
          const idx = yIndex(nx, y, nz);
          if (blocks[idx] === BLOCK.AIR || blocks[idx] === BLOCK.LEAVES) {
            if (!(dx === 0 && dz === 0 && y < top)) {
              blocks[idx] = BLOCK.LEAVES;
            }
          }
        }
      }
    }
    blocks[yIndex(lx, top, lz)] = BLOCK.LEAVES;
  }

  _generateVoidChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT).fill(BLOCK.AIR);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const { floorY, island } = this.voidHeightAt(wx, wz);

        // Continent-like broken floor of void stone
        for (let y = 0; y <= floorY; y++) {
          const isurf = y === floorY;
          blocks[yIndex(lx, y, lz)] = isurf ? BLOCK.VOID_GRASS : BLOCK.VOID_STONE;
        }

        // Void shard ore veins in the floor
        if (Math.abs(this.decor(wx / 60, wz / 60)) > 0.75) {
          const veinY = Math.max(2, floorY - 1 - Math.floor(((this.decor(wx / 7, wz / 7) * 0.5 + 0.5) * 4)));
          blocks[yIndex(lx, veinY, lz)] = BLOCK.VOID_SHARD_ORE;
        }

        // Floating islands (decorative)
        if (island) {
          const floatBase = 70 + Math.floor(Math.abs(this.decor(wx / 90, wz / 90)) * 20);
          for (let dy = 0; dy < 3; dy++) {
            if (floatBase + dy < WORLD_HEIGHT) {
              blocks[yIndex(lx, floatBase + dy, lz)] = BLOCK.VOID_STONE;
            }
          }
        }
      }
    }
    return blocks;
  }
}

function yIndex(x, y, z) {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}
function indexToXYZ(i) {
  const x = i % CHUNK_SIZE;
  const y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
  const z = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
  return { x, y, z };
}

module.exports = {
  TerrainGenerator,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  WORLD_BORDER,
  yIndex,
  indexToXYZ,
  OVERWORLD,
  VOID,
  hashSeed,
};
