const assert = require("assert");
const chunkStore = require("../server/world/chunkStore");
const { decompressBlocks, compressIntMap, decompressIntMap } = chunkStore;
const { BLOCK } = require("../server/world/blocks");
const { CHUNK_SIZE, WORLD_HEIGHT, yIndex } = require("../server/world/terrain");

// --- mock the DB-backed store with an in-memory fake ---
const mem = new Map(); // "dim:cx:cz" -> {terrain, modifications, generated}
function fakeKey(dim, cx, cz) { return `${dim}:${cx}:${cz}`; }

chunkStore.loadChunk = async function (dimension, cx, cz, { blocks }) {
  const k = fakeKey(dimension, cx, cz);
  const row = mem.get(k);
  if (!row || !row.generated) {
    return { terrain: null, modifications: [], generated: false };
  }
  return {
    terrain: row.terrain,
    terrainData: decompressBlocks(row.terrain, blocks.length),
    modifications: decompressIntMap(row.modifications),
    generated: true,
  };
};

chunkStore.createChunk = async function (dimension, cx, cz, blocks) {
  const b64 = require("../server/world/chunkStore").compressBlocks(blocks);
  mem.set(fakeKey(dimension, cx, cz), { terrain: b64, modifications: "", generated: true });
};

chunkStore.saveModifications = async function (dimension, cx, cz, mods) {
  const b64 = compressIntMap(mods);
  const k = fakeKey(dimension, cx, cz);
  const row = mem.get(k) || { terrain: "", generated: false };
  mem.set(k, { ...row, modifications: b64 });
};

function run() {
  let pass = 0, fail = 0;
  function test(name, fn) {
    try { fn(); pass++; console.log(`  PASS ${name}`); }
    catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); }
  }
  console.log("Voidoria world engine tests");

  test("Modification is recorded and reverted to AIR", async () => {
    const { WorldEngine } = require("../server/world/worldEngine");
    const world = new WorldEngine({ seed: 99 });
    await world.getChunk("overworld", 0, 0);

    // find a solid stone block in chunk 0,0
    const c0 = world.cache.get("overworld:0:0");
    const blocks = c0.blocks;
    let target;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] === BLOCK.STONE) { target = i; break; }
    }
    assert.ok(target !== undefined, "found stone block");
    // convert index to xyz
    const x = target % CHUNK_SIZE;
    const z = Math.floor(target / CHUNK_SIZE) % CHUNK_SIZE;
    const y = Math.floor(target / (CHUNK_SIZE * CHUNK_SIZE));

    const res = await world.setBlock("overworld", x, y, z, BLOCK.AIR);
    assert.strictEqual(res.changed, true);
    assert.strictEqual(world.blockAt("overworld", x, y, z), BLOCK.AIR);
    assert.strictEqual(c0.modified.get(target), BLOCK.AIR, "modification recorded");
  });

  test("Modification reverts to natural when restored", async () => {
    const { WorldEngine } = require("../server/world/worldEngine");
    const world = new WorldEngine({ seed: 99 });
    await world.getChunk("overworld", 0, 0);
    const c0 = world.cache.get("overworld:0:0");
    const gen = world.generator("overworld");
    const pure = gen.generateChunk(0, 0);
    // modify a block to something else
    let idx;
    for (let i = 0; i < pure.length; i++) { if (pure[i] === BLOCK.STONE) { idx = i; break; } }
    const x = idx % CHUNK_SIZE, z = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE, y = Math.floor(idx / (CHUNK_SIZE*CHUNK_SIZE));
    await world.setBlock("overworld", x, y, z, BLOCK.PLANKS);
    assert.strictEqual(c0.modified.get(idx), BLOCK.PLANKS);
    // restore to natural stone
    await world.setBlock("overworld", x, y, z, BLOCK.STONE);
    assert.strictEqual(c0.modified.has(idx), false, "modification removed when back to natural");
  });

  test("Borders are enforced on block modification", async () => {
    const { WorldEngine } = require("../server/world/worldEngine");
    const world = new WorldEngine({ seed: 99 });
    let threw = false;
    try { await world.setBlock("overworld", 5001, 60, 0, BLOCK.AIR); }
    catch (e) { threw = true; }
    assert.ok(threw, "block edit outside border rejected");
  });

  test("Chunk data round-trips through compression", () => {
    const { compressBlocks, decompressBlocks } = require("../server/world/chunkStore");
    const arr = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    arr[10] = 3; arr[1000] = 1; arr[29999] = 21;
    const b64 = compressBlocks(arr);
    const out = decompressBlocks(b64, arr.length);
    assert.deepStrictEqual(Buffer.from(out), Buffer.from(arr));
  });

  test("Int map round-trips through compression", () => {
    const mods = [[5, 3], [200, 21], [9999, 0]];
    const b64 = compressIntMap(mods);
    const out = decompressIntMap(b64);
    assert.deepStrictEqual(out, mods);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

run();
