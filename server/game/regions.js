// ============================================================================
// VOIDORIA — World layout: regions, cities, towns, commercial districts.
//
// The world is a 2D top-down space. Coordinates are world-units where the
// origin (0,0) is the city center. Regions define named areas players move in.
// ============================================================================

// Each region: { key, name, kind, x, y, radius, district? }
//   kind: CITY | TOWN | WILDERNESS | FOREST | MOUNTAIN | LAKE | RIVER |
//         RESOURCE | AGRI | INDUSTRIAL | COMMERCIAL
const REGIONS = [
  // --- Central metropolis ---
  { key: "city",      name: "Aurora",        kind: "CITY",       x: 0,    y: 0,    radius: 60 },
  { key: "city-west", name: "West Market",   kind: "COMMERCIAL", x: -40,  y: 5,    radius: 20 },
  { key: "city-east", name: "East Industrial", kind: "INDUSTRIAL", x: 45,  y: 10,   radius: 20 },

  // --- Towns ---
  { key: "northville", name: "Northville",   kind: "TOWN",       x: 0,    y: -160, radius: 35 },
  { key: "southport",  name: "Southport",    kind: "TOWN",       x: 0,    y: 170,  radius: 35 },
  { key: "eastbrook",  name: "Eastbrook",    kind: "TOWN",       x: 180,  y: 0,    radius: 30 },

  // --- Forests / lumber ---
  { key: "greatwood",  name: "Greatwood Forest",  kind: "FOREST",   x: -120, y: -120, radius: 70, resources: ["wood"] },
  { key: "silverwood", name: "Silverwood",        kind: "FOREST",   x: 150,  y: -150, radius: 60, resources: ["wood"] },

  // --- Mountains / mining ---
  { key: "ironpeak",   name: "Ironpeak",      kind: "MOUNTAIN", x: -180, y: 140,  radius: 70, resources: ["iron_ore", "coal", "stone"] },
  { key: "copperridge",name: "Copper Ridge",  kind: "MOUNTAIN", x: 200,  y: 150,  radius: 60, resources: ["copper_ore", "stone"] },
  { key: "golduphill", name: "Gold Uphill",   kind: "RESOURCE",  x: -220, y: 60,   radius: 40, resources: ["gold_ore", "coal"] },

  // --- Agriculture ---
  { key: "greenvale",  name: "Greenvale Farmlands", kind: "AGRI", x: 0, y: 320, radius: 90, resources: ["wheat", "cotton", "berries"] },

  // --- Lakes / rivers ---
  { key: "mirrorlake", name: "Mirror Lake",   kind: "LAKE",      x: 140, y: 260,  radius: 50, resources: ["water"] },
  { key: "theriver",   name: "The River",     kind: "RIVER",     x: 0,   y: 80,   radius: 15, resources: ["water"] },

  // --- General wilderness / stone & sand ---
  { key: "sandsea",    name: "Sand Sea",      kind: "WILDERNESS", x: -260, y: -200, radius: 80, resources: ["sand", "clay"] },
  { key: "flatstone",  name: "Stone Flats",   kind: "WILDERNESS", x: 260,  y: -220, radius: 70, resources: ["stone", "clay"] },
];

const REGION_BY_KEY = Object.fromEntries(REGIONS.map((r) => [r.key, r]));

// Returns the region a coordinate falls inside (largest radius wins ties by
// distance). Returns the closest region otherwise.
function regionAt(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, y - r.y);
    if (d <= r.radius) return r;
    if (d < bestDist) { bestDist = d; best = r; }
  }
  return best;
}

// The spawn / starting town.
const SPAWN = { x: 0, y: 0, region: "city" };

// World bounds for the 2D map (accounts for the widest region extents).
const WORLD_BOUNDS = { minX: -450, maxX: 450, minY: -450, maxY: 450 };

module.exports = { REGIONS, REGION_BY_KEY, regionAt, SPAWN, WORLD_BOUNDS };
