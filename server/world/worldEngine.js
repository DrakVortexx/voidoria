const { TerrainGenerator, CHUNK_SIZE, WORLD_HEIGHT, yIndex, indexToXYZ, OVERWORLD, VOID } = require("./terrain");
const chunkStore = require("./chunkStore");
const { BLOCK, BLOCK_META } = require("./blocks");

const WORLD_VERSION = 1;
const MAX_CACHED = 2048;

function key(dim, cx, cz) {
  return `${dim}:${cx}:${cz}`;
}

class WorldEngine {
  constructor({ seed }) {
    this.seed = seed;
    this.cache = new Map();
    this.generators = {};
    this._persistQueue = new Set();
    this._persistTimer = null;
    this.terrainVersion = 2; // bump when terrain formula changes
    this.genVersion = 1;
  }

  generator(dimension) {
    if (!this.generators[dimension]) {
      this.generators[dimension] = new TerrainGenerator({ seed: this.seed, dimension });
    }
    return this.generators[dimension];
  }

  async getChunk(dimension, cx, cz, { withData = true } = {}) {
    const k = key(dimension, cx, cz);
    let entry = this.cache.get(k);
    if (entry && entry.loaded) {
      this._touch(k);
      if (withData) {
        return { cx, cz, blocks: entry.blocks, modified: entry.modified };
      }
      return { cx, cz };
    }

    entry = await this._loadOrGenerate(dimension, cx, cz);
    this.cache.set(k, entry);
    this._touch(k);
    this._evict();
    if (withData) return { cx, cz, blocks: entry.blocks, modified: entry.modified };
    return { cx, cz };
  }

  async _loadOrGenerate(dimension, cx, cz) {
    const gen = this.generator(dimension);
    const chunks0 = { cx, cz };
    const blocks = gen.generateChunk(cx, cz);

    const loaded = await chunkStore.loadChunk(dimension, cx, cz, {
      blocks,
      worldVersion: this.worldVersionFor(dimension),
    });

    if (loaded.generated) {
      // use stored terrain + modifications
      return {
        cx, cz, dimension,
        blocks: this._applyMods(loaded.terrainData, loaded.modifications),
        modified: new Map(loaded.modifications.map((m) => [m[0], m[1]])),
        dirty: false,
        generated: true,
        loaded: true,
        _rowExisting: true,
      };
    }

    // new chunk: generate and persist terrain
    await chunkStore.createChunk(dimension, cx, cz, blocks, this.worldVersionFor(dimension));
    return {
      cx, cz, dimension,
      blocks,
      modified: new Map(),
      dirty: false,
      generated: true,
      loaded: true,
      _rowExisting: false,
    };
  }

  _applyMods(base, mods) {
    if (base.length !== CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT) {
      // mismatched, regenerate fallback handled by caller; return base as-is logic
    }
    const arr = new Uint8Array(base);
    for (const [idx, b] of mods) {
      if (idx >= 0 && idx < arr.length) arr[idx] = b;
    }
    return arr;
  }

  blockAt(dimension, x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    return this.cache.get(key(dimension, cx, cz))?.blocks?.[yIndex(lx, y, lz)] ?? BLOCK.AIR;
  }

  async setBlock(dimension, x, y, z, blockId, { validate = true } = {}) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (y < 0 || y >= WORLD_HEIGHT) throw new Error("Out of world height");
    const withinBorder = Math.abs(x) <= 5000 && Math.abs(z) <= 5000;
    if (validate && !withinBorder) throw new Error("Out of world border");
    if (blockId === BLOCK.BEDROCK) throw new Error("Cannot modify bedrock");
    if (blockId === BLOCK.VOID_CORE) throw new Error("Cannot modify void core");

    const entry = await this.getChunk(dimension, cx, cz);
    const idx = yIndex(lx, y, lz);
    const prev = entry.blocks[idx];

    if (prev === blockId) return { changed: false };

    // bedrock cannot be modified in stored data
    if (prev === BLOCK.BEDROCK || prev === BLOCK.VOID_CORE) {
      throw new Error("Cannot modify unbreakable block");
    }

    entry.blocks[idx] = blockId;

    // record modifier
    const gen = this.generator(dimension);
    const pureBlocks = gen.generateChunk(cx, cz);
    if (pureBlocks[idx] === blockId) {
      entry.modified.delete(idx); // restored to natural: drop modify
    } else {
      entry.modified.set(idx, blockId);
    }
    entry.dirty = true;
    this._queuePersist(dimension, cx, cz, entry);
    return { changed: true, prev, block: blockId };
  }

  async _queuePersist(dimension, cx, cz, entry) {
    // store mods in memory; debounce DB write
    this._persistQueue.add({ dimension, cx, cz });
    if (!this._persistTimer) {
      this._persistTimer = setTimeout(() => this._flushPersist(), 3000);
    }
  }

  async _flushPersist() {
    this._persistTimer = null;
    const items = Array.from(this._persistQueue);
    this._persistQueue.clear();
    for (const { dimension, cx, cz } of items) {
      const entry = this.cache.get(key(dimension, cx, cz));
      if (!entry || !entry.dirty) continue;
      await this._persistChunk(entry);
      entry.dirty = false;
    }
  }

  async _persistChunk(entry) {
    try {
      const mods = Array.from(entry.modified.entries());
      await chunkStore.saveModifications(entry.dimension, entry.cx, entry.cz, mods, this.genVersion);
    } catch (err) {
      console.error("Persist chunk error:", err);
    }
  }

  async saveAll() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    for (const entry of this.cache.values()) {
      if (entry.dirty) {
        await this._persistChunk(entry);
        entry.dirty = false;
      }
    }
  }

  computeNeighbors(dimension, cx, cz) {
    return [
      { k: key(dimension, cx - 1, cz), dx: -CHUNK_SIZE, dz: 0 },
      { k: key(dimension, cx + 1, cz), dx: CHUNK_SIZE, dz: 0 },
      { k: key(dimension, cx, cz - 1), dx: 0, dz: -CHUNK_SIZE },
      { k: key(dimension, cx, cz + 1), dx: 0, dz: CHUNK_SIZE },
    ];
  }

  _touch(k) {
    const e = this.cache.get(k);
    if (e) {
      this.cache.delete(k);
      this.cache.set(k, e);
    }
  }

  _evict() {
    if (this.cache.size <= MAX_CACHED) return;
    const toEvict = this.cache.size - MAX_CACHED;
    const it = this.cache.keys();
    for (let i = 0; i < toEvict && this.cache.size > 0; i++) {
      const k = it.next().value;
      const entry = this.cache.get(k);
      if (entry?.dirty) {
        // persist before eviction
        this._persistChunk(entry).catch(() => {});
        entry.dirty = false;
      }
      this.cache.delete(k);
    }
  }

  worldVersionFor(dimension) {
    return this.genVersion;
  }

  findSpawn() {
    // find safe overworld spawn near 0,0
    return { x: 8, y: 0, z: 8 };
  }

  findSurfaceY(dimension, x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const entry = this.cache.get(key(dimension, cx, cz));
    if (!entry) return null;
    return this._surfaceTop(entry.blocks, x - cx * CHUNK_SIZE, z - cz * CHUNK_SIZE);
  }

  _surfaceTop(blocks, lx, lz) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = blocks[yIndex(lx, y, lz)];
      if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES && b !== BLOCK.SNOW && b !== BLOCK.FLOWER && b !== BLOCK.CACTUS && b !== BLOCK.VOID_GRASS) {
        return y;
      }
    }
    return 1;
  }

  isSolid(block) {
    const meta = BLOCK_META[block];
    return meta ? meta.solid !== false : block !== BLOCK.AIR;
  }
}

module.exports = { WorldEngine, WORLD_VERSION };
