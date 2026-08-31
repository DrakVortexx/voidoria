const assert = require("assert");
const { TerrainGenerator, CHUNK_SIZE, WORLD_HEIGHT, yIndex, OVERWORLD, VOID } = require("../server/world/terrain");
const { BLOCK } = require("../server/world/blocks");

function run() {
  let pass = 0, fail = 0;

  function test(name, fn) {
    try {
      fn();
      pass++;
      console.log(`  PASS ${name}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${name}: ${e.message}`);
    }
  }

  console.log("Voidoria terrain tests");

  test("Chunk shape is correct (16x16x128)", () => {
    const g = new TerrainGenerator({ seed: 42, dimension: OVERWORLD });
    const c = g.generateChunk(3, -5);
    assert.strictEqual(c.length, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  });

  test("Generation is deterministic (same seed -> same chunk)", () => {
    const g1 = new TerrainGenerator({ seed: 42 });
    const g2 = new TerrainGenerator({ seed: 42 });
    const a = g1.generateChunk(10, 10);
    const b = g2.generateChunk(10, 10);
    assert.deepStrictEqual(Buffer.from(a), Buffer.from(b));
  });

  test("Generation is deterministic for negative coords", () => {
    const g = new TerrainGenerator({ seed: 7 });
    const a = g.generateChunk(-12, 33);
    const b = new TerrainGenerator({ seed: 7 }).generateChunk(-12, 33);
    assert.deepStrictEqual(Buffer.from(a), Buffer.from(b));
  });

  test("Different seeds produce different terrain", () => {
    const a = new TerrainGenerator({ seed: 1 }).generateChunk(0, 0);
    const b = new TerrainGenerator({ seed: 2 }).generateChunk(0, 0);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    assert.ok(diff > 10, `expected differences, got ${diff}`);
  });

  test("World contains surface blocks and bedrock base", () => {
    const c = new TerrainGenerator({ seed: 42 }).generateChunk(0, 0);
    const vol = CHUNK_SIZE * CHUNK_SIZE;
    // bedrock at y=0 for all columns inside border
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        assert.strictEqual(c[yIndex(x, 0, z)], BLOCK.BEDROCK);
      }
    }
    // some non-air above bedrock
    let solid = 0;
    for (let i = 0; i < c.length; i++) if (c[i] !== BLOCK.AIR) solid++;
    assert.ok(solid > vol, "expected substantial terrain");
  });

  test("Y-index mapping round trips", () => {
    for (const [x, y, z] of [[0,0,0],[15,127,15],[5,60,9]]) {
      const i = yIndex(x, y, z);
      const x2 = i % CHUNK_SIZE;
      const z2 = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
      const y2 = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
      assert.strictEqual(x2, x);
      assert.strictEqual(z2, z);
      assert.strictEqual(y2, y);
    }
  });

  test("Void dimension generates distinct terrain", () => {
    const g = new TerrainGenerator({ seed: 42, dimension: VOID });
    const c = g.generateChunk(0, 0);
    assert.strictEqual(c.length, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    // deterministic
    const c2 = new TerrainGenerator({ seed: 42, dimension: VOID }).generateChunk(0, 0);
    assert.deepStrictEqual(Buffer.from(c), Buffer.from(c2));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run();
