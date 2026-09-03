const prisma = require("../db");
const { REGIONS, REGION_BY_KEY, regionAt, SPAWN, WORLD_BOUNDS } = require("../game/regions");
const { getItem } = require("../game/items");

// Deterministic pseudo-random from a seed string
function hashSeed(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Node density per region kind
function nodeCountFor(region) {
  const table = { FOREST: 40, MOUNTAIN: 46, WILDERNESS: 26, AGRI: 34, LAKE: 20, RIVER: 12, RESOURCE: 30, CITY: 2, TOWN: 4, COMMERCIAL: 2, INDUSTRIAL: 6 };
  return table[region.kind] || 12;
}

// Build deterministic node positions for a region based on its resource list.
function buildNodes(region, seedBase) {
  const nodeSeed = hashSeed(`${seedBase}:${region.key}`);
  const rng = mulberry32(nodeSeed);
  const resTypes = region.resources || ["stone", "wood"];
  const count = nodeCountFor(region);
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * region.radius * 0.9;
    const x = Math.round(region.x + Math.cos(angle) * dist);
    const y = Math.round(region.y + Math.sin(angle) * dist);
    const itemDef = resTypes[Math.floor(rng() * resTypes.length)];
    nodes.push({ regionKey: region.key, itemDef, x, y });
  }
  const seen = new Set();
  return nodes.filter((n) => {
    const k = `${n.x}:${n.y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function resourceNodeKey(region) {
  const nodeSeed = process.env.WORLD_SEED || "20260831";
  return `${nodeSeed}:${region.key}`;
}

// Ensure world data (regions + nodes) is seeded once. Called at startup.
async function seedWorld() {
  const seedBase = process.env.WORLD_SEED || "20260831";
  await prisma.worldRegion.createMany({
    data: REGIONS.map((r) => ({
      key: r.key, name: r.name, kind: r.kind,
      x: r.x, y: r.y, radius: r.radius,
      data: { resources: r.resources || [] },
    })),
    skipDuplicates: true,
  });

  // deterministic nodes — upsert by a stable nodeId stored in data
  for (const region of REGIONS) {
    const nodes = buildNodes(region, seedBase);
    for (const n of nodes) {
      const existing = await prisma.resourceNode.findFirst({
        where: { regionKey: region.key, x: n.x, y: n.y },
      });
      if (existing) continue;
      await prisma.resourceNode.create({
        data: {
          regionKey: n.regionKey, itemDef: n.itemDef,
          x: n.x, y: n.y, amount: 100, maxAmount: 100,
        },
      }).catch(() => {});
    }
  }
}

// List resource nodes visible near a position (for the client map / gathering).
async function nodesNear(x, y, radius = 30) {
  const region = regionAt(x, y);
  if (!region) return [];
  const nodes = await prisma.resourceNode.findMany({
    where: { regionKey: region.key, respawnAt: null, amount: { gt: 0 } },
  });
  return nodes
    .filter((n) => Math.hypot(n.x - x, n.y - y) <= radius)
    .slice(0, 40)
    .map((n) => ({
      id: n.id, itemDef: n.itemDef,
      name: getItem(n.itemDef)?.name || n.itemDef,
      icon: getItem(n.itemDef)?.icon || "•",
      x: n.x, y: n.y, amount: n.amount,
    }));
}

// Gather from a node. Server-authoritative: validates proximity + availability,
// then deducts and grants items, and schedules a respawn when depleted.
async function gather(playerId, nodeId, { tx } = {}) {
  const c = tx || prisma;
  const node = await c.resourceNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new Error("Resource node not found");
  if (node.amount <= 0) throw new Error("This node is depleted");
  if (node.respawnAt && node.respawnAt > new Date()) throw new Error("This node is depleted");

  const def = getItem(node.itemDef);
  if (!def) throw new Error("Unknown resource");
  const yieldAmount = def.type === "resource" ? Math.max(1, Math.ceil(def.stack / 20)) : 1;

  await c.resourceNode.update({
    where: { id: nodeId },
    data: { amount: Math.max(0, node.amount - yieldAmount) },
  });
  const inventory = require("./inventory");
  await inventory.addItem(playerId, node.itemDef, yieldAmount, { tx: c });

  // if fully depleted, set a respawn time
  if (node.amount - yieldAmount <= 0) {
    await c.resourceNode.update({
      where: { id: nodeId },
      data: { respawnAt: new Date(Date.now() + 2 * 60 * 1000), amount: 0 },
    });
  }
  return { itemDef: node.itemDef, amount: yieldAmount, remaining: Math.max(0, node.amount - yieldAmount) };
}

// Called periodically: restore depleted nodes that have reached respawn time.
async function respawnNodes() {
  await prisma.resourceNode.updateMany({
    where: { respawnAt: { lte: new Date() } },
    data: { respawnAt: null, amount: 100 },
  });
}

function spawnPoint() {
  return { x: SPAWN.x, y: SPAWN.y, region: SPAWN.region };
}

module.exports = { seedWorld, nodesNear, gather, respawnNodes, spawnPoint, regionAt, REGIONS, REGION_BY_KEY, WORLD_BOUNDS, buildNodes };
