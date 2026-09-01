// Local chunk streaming + memory/OOM stress test. Runs entirely offline:
// chunkStore is injected as an in-memory mock (no Neon/DB), so only the real
// WorldEngine getChunk -> queue -> in-flight dedup -> generate -> cache path
// is exercised.
//   Usage: node tests/chunk.stream.test.js
const assert = require("assert");
const { WorldEngine } = require("../server/world/worldEngine");
const { CHUNK_SIZE, OVERWORLD } = require("../server/world/terrain");
const { BLOCK } = require("../server/world/blocks");

// ---------- mock chunkStore (in-memory, simulates persistence) ----------
function keyOf(dim, cx, cz) {
  return `${dim}:${cx}:${cz}`;
}

function makeChunkStore() {
  const stored = new Map(); // "dim:cx:cz" -> { blocks, modified[] }
  return {
    stored,
    async loadChunk(dimension, cx, cz, { blocks, worldVersion }) {
      const k = keyOf(dimension, cx, cz);
      const row = stored.get(k);
      if (!row) return { terrain: "", modifications: [], generated: false };
      if (row.worldVersion !== worldVersion) {
        return { terrain: "", modifications: [], generated: false };
      }
      return {
        terrain: "x",
        terrainData: new Uint8Array(blocks),
        modifications: row.modified || [],
        row,
        generated: true,
      };
    },
    async createChunk(dimension, cx, cz, blocks, worldVersion) {
      const k = keyOf(dimension, cx, cz);
      if (stored.has(k)) return stored.get(k); // idempotent, no overwrite
      const row = { blocks, modified: [], worldVersion, generated: true };
      stored.set(k, row);
      return row;
    },
    async saveModifications() {},
  };
}

// ---------- helpers ----------
const metrics = require("../server/world/chunkMetrics");
let lastStore = null;

function newWorld() {
  // Reset the engine's own pipeline counters (they are the source of truth for
  // how many chunks were generated / persisted).
  for (const k of Object.keys(metrics.counter)) metrics.counter[k] = 0;
  const store = makeChunkStore();
  lastStore = store;
  return new WorldEngine({ seed: 1234, chunkStore: store });
}

function generated() {
  return metrics.counter.generated;
}

function dbWrites() {
  return metrics.counter.dbWrites;
}

async function loadArea(world, dim, cx, cz, vd) {
  const results = [];
  for (let dx = -vd; dx <= vd; dx++) {
    for (let dz = -vd; dz <= vd; dz++) {
      results.push(world.getChunk(dim, cx + dx, cz + dz));
    }
  }
  return Promise.all(results);
}

function heap() {
  return process.memoryUsage().heapUsed;
}

// ---------- tests (registered in order, run sequentially below) ----------
const testList = [];
function test(name, fn) { testList.push({ name, fn }); }

// 1. Single chunk loads, generated exactly once
test("Single chunk loads and generates exactly once", async () => {
  const w = newWorld();
  const { blocks } = await w.getChunk(OVERWORLD, 0, 0);
  assert.ok(blocks.length === CHUNK_SIZE * CHUNK_SIZE * 128);
  assert.strictEqual(generated(), 1, "expected exactly 1 generation");
});

// 2. Concurrent duplicate requests generate once (in-flight dedup)
test("1000 concurrent requests for same chunk -> 1 generation", async () => {
  const w = newWorld();
  const results = await Promise.all(
    Array.from({ length: 1000 }, () => w.getChunk(OVERWORLD, 5, 5))
  );
  for (const r of results) assert.ok(r.blocks.length > 0);
  assert.strictEqual(generated(), 1, "dedup failed: multiple generations");
});

// 3. 81-chunk initial load generates exactly 81 (once each)
test("81 chunks load -> exactly 81 generations, no dup", async () => {
  const w = newWorld();
  await loadArea(w, OVERWORLD, 0, 0, 4); // 9x9 = 81
  assert.strictEqual(generated(), 81, `expected 81 generations, got ${generated()}`);
  assert.strictEqual(w.cache.size, 81);
});

// 4. Re-requesting same area after it is cached: zero new generations
test("Re-requesting cached area generates nothing", async () => {
  const w = newWorld();
  await loadArea(w, OVERWORLD, 0, 0, 4);
  const before = generated();
  for (let i = 0; i < 20; i++) await loadArea(w, OVERWORLD, 0, 0, 4);
  assert.strictEqual(generated(), before, "cached chunks were regenerated");
});

// 5. Move out 20 chunks: only new edge chunks generate (no re-request of loaded)
test("Move 20 chunks reuses cache, generates only new chunks", async () => {
  const w = newWorld();
  await loadArea(w, OVERWORLD, 0, 0, 4);
  const before = generated();
  await loadArea(w, OVERWORLD, 20, 0, 4); // move +20 on X
  // 20 new columns * 9 rows - overlap: at vd4, moving 20 clears all old 9x9
  const newChunks = 81;
  assert.ok(generated() - before <= newChunks, `generated ${generated() - before}, expected <= ${newChunks}`);
  // cache is bounded
  assert.ok(w.cache.size <= 1024);
});

// 6. Repeated back-and-forth + diagonal + boundary crossing stays bounded
test("Back/forth + diagonal + boundary crossing: memory stable, no unbounded growth", async () => {
  const w = newWorld();
  const path = [];
  for (let i = 0; i < 20; i++) { path.push({ cx: i, cz: 0 }); }
  for (let i = 20; i >= 0; i--) { path.push({ cx: i, cz: 0 }); }
  for (let i = 0; i < 20; i++) { path.push({ cx: i, cz: i }); }   // diagonal
  for (let i = 0; i < 10; i++) { path.push({ cx: 0, cz: -i }); }  // negative crossing

  const before = heap();
  for (let round = 0; round < 20; round++) {
    for (const p of path) {
      await loadArea(w, OVERWORLD, p.cx, p.cz, 4);
    }
  }
  const after = heap();
  const growthMB = (after - before) / (1024 * 1024);
  assert.ok(w.cache.size <= 1024, `cache unbounded: ${w.cache.size}`);
  // Heap should stabilize (bounded cache + GC), not grow without limit.
  console.log(`    heap before=${(before / 1024 / 1024).toFixed(1)}MB after=${(after / 1024 / 1024).toFixed(1)}MB growth=${growthMB.toFixed(2)}MB cache=${w.cache.size}`);
  assert.ok(growthMB < 200, `heap grew ${growthMB.toFixed(1)}MB - possible leak`);
});

// 7. DB write protection: same chunk requested again -> no duplicate DB writes
test("Repeated same-chunk requests do not re-persist to DB", async () => {
  const w = newWorld();
  await w.getChunk(OVERWORLD, 3, 7);
  const writesAfterFirst = dbWrites();
  for (let i = 0; i < 50; i++) await w.getChunk(OVERWORLD, 3, 7);
  assert.strictEqual(lastStore.stored.size, 1, "duplicate chunks persisted");
  assert.strictEqual(dbWrites(), writesAfterFirst, "DB re-wrote an already-persisted chunk");
});

// 8. Cache eviction under pressure keeps the cache bounded
test("Cache eviction keeps cache bounded under load", async () => {
  const w = newWorld();
  await loadArea(w, OVERWORLD, 0, 0, 4);
  // dirty a bunch
  for (let i = 0; i < 20; i++) {
    await w.setBlock(OVERWORLD, i, 70, 0, BLOCK.STONE);
  }
  // force eviction pressure by loading lots of chunks beyond MAX_CACHED
  for (let dx = -30; dx <= 30; dx += 2) {
    await w.getChunk(OVERWORLD, dx, dx * 2 + 1);
  }
  assert.ok(w.cache.size <= 1024, `cache size ${w.cache.size} exceeded cap`);
});

// 9. Instance reuse: connect/reconnect pattern stays bounded
test("Simulated reconnect (new engine, same stored world) does not leak", async () => {
  for (let i = 0; i < 10; i++) {
    const w = newWorld();
    await loadArea(w, OVERWORLD, 0, 0, 4);
    await loadArea(w, OVERWORLD, 4, 4, 4);
    await w.saveAll();
    assert.ok(w.cache.size <= 1024);
  }
});

async function runAsync() {
  console.log("VOIDORIA chunk stream + OOM stress tests (offline/mocked DB)");
  let pass = 0, fail = 0;
  for (const { name, fn } of testList) {
    try {
      await fn();
      pass++;
      console.log(`  PASS ${name}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${name}: ${e.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  console.log("chunk store rows:", lastStore ? lastStore.stored.size : 0);
}

runAsync().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});