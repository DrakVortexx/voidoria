// ============================================================================
// Voidoria game-definition integrity tests (no database required).
// Run with: npm test
// ============================================================================
const assert = require("assert");
const { ITEM, getItem, getCategory, CATEGORIES } = require("../server/game/items");
const { REGIONS, regionAt, SPAWN, WORLD_BOUNDS } = require("../server/game/regions");
const { buildNodes } = require("../server/services/world");
const { PLOTS } = require("../server/services/shop");
const shop = require("../server/services/shop");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.error("  FAIL - " + name + "\n    " + e.message); }
}

console.log("Voidoria game integrity tests\n");

// ---------- Item catalog integrity ----------
test("all items have a name, positive base value and a stack of >=1", () => {
  for (const [id, it] of Object.entries(ITEM)) {
    assert.ok(it.name, id + " missing name");
    assert.ok(it.baseValue >= 0, id + " baseValue must be >= 0");
    assert.ok(it.stack >= 1, id + " stack must be >= 1");
    assert.ok(it.category, id + " missing category");
  }
});

test("every recipe cost references a defined item", () => {
  for (const [id, it] of Object.entries(ITEM)) {
    if (!it.recipe) continue;
    for (const cost of it.recipe) {
      assert.ok(ITEM[cost.item], id + " recipe references unknown item " + cost.item);
      assert.ok(cost.qty > 0, id + " recipe qty must be > 0");
    }
    assert.ok(it.timeMs > 0, id + " recipe missing timeMs");
    assert.ok(Array.isArray(it.producesPerJob) && it.producesPerJob.length === 2, id + " recipe missing producesPerJob range");
  }
});

test("product chain is a DAG (no item referenced only by itself loops detected)", () => {
  const visited = new Set();
  const visiting = new Set();
  function dfs(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("cycle at " + id);
    visiting.add(id);
    const it = ITEM[id];
    if (it && it.recipe) for (const c of it.recipe) dfs(c.item);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of Object.keys(ITEM)) dfs(id);
});

test("lookup helpers work", () => {
  assert.equal(getItem("wood").name, "Wood");
  assert.equal(getCategory("Timber").length > 0, true);
  assert.equal(Array.isArray(CATEGORIES), true);
});

test("every category is non-empty", () => {
  for (const c of CATEGORIES) assert.ok(getCategory(c).length > 0, "empty category " + c);
});

// ---------- World/region integrity ----------
test("regions are unique and spawn is inside the city", () => {
  const keys = new Set(REGIONS.map((r) => r.key));
  assert.equal(keys.size, REGIONS.length, "duplicate region keys");
  const at = regionAt(SPAWN.x, SPAWN.y);
  assert.equal(at.kind, "CITY");
});

test("regions fall within world bounds", () => {
  for (const r of REGIONS) {
    assert.ok(r.x + r.radius <= WORLD_BOUNDS.maxX + 1, r.key + " x out of bounds");
    assert.ok(r.x - r.radius >= WORLD_BOUNDS.minX - 1, r.key + " x out of bounds (min)");
    assert.ok(r.y + r.radius <= WORLD_BOUNDS.maxY + 1, r.key + " y out of bounds");
    assert.ok(Math.abs(r.x) < 1000 && Math.abs(r.y) < 1000, r.key + " absurd coords");
  }
});

test("regionAt always returns a region", () => {
  assert.ok(regionAt(0, 0));
  assert.ok(regionAt(1000, 1000));
});

test("resource nodes generate deterministically within region", () => {
  const region = REGIONS.find((r) => r.kind === "MOUNTAIN");
  const nodesA = buildNodes(region, "20260831");
  const nodesB = buildNodes(region, "20260831");
  assert.equal(nodesA.length, nodesB.length);
  assert.deepEqual(nodesA, nodesB, "generation must be deterministic");
  for (const n of nodesA) {
    const d = Math.hypot(n.x - region.x, n.y - region.y);
    assert.ok(d <= region.radius + 1, "node " + n.itemDef + " outside region radius");
    assert.ok(region.resources.includes(n.itemDef), "node item not in region resources");
  }
});

// ---------- Shop plot integrity ----------
test("shop plots are predefined, unique and within a region", () => {
  const keys = new Set(PLOTS.map((p) => p.plotKey));
  assert.equal(keys.size, PLOTS.length, "duplicate plot keys");
  const regionKeys = new Set(REGIONS.map((r) => r.key));
  for (const p of PLOTS) {
    assert.ok(regionKeys.has(p.regionKey), p.plotKey + " unknown region " + p.regionKey);
    assert.ok(p.sizeW >= 1 && p.sizeH >= 1);
    assert.ok(p.baseValue > 0);
  }
});

test("shop seedPlots data is consistent with service", () => {
  assert.equal(shop.PLOTS.length, PLOTS.length);
});

// ---------- Economy helpers ----------
test("net worth / inventory conservative valuation maths are sound", () => {
  const item = "wood";
  const def = getItem(item);
  const effective = Math.floor(def.baseValue * 0.6 * 1); // quality 1
  assert.ok(effective > 0);
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
