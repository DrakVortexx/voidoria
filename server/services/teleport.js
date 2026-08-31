const prisma = require("../db");
const { WORLD_BORDER, WORLD_HEIGHT, OVERWORLD } = require("../world/terrain");

async function getCooldown(userId, kind) {
  const c = await prisma.cooldown.findUnique({ where: { userId_kind: { userId, kind } } });
  if (!c) return 0;
  const remain = Math.max(0, c.endsAt.getTime() - Date.now());
  return remain;
}

async function setCooldown(userId, kind, ms) {
  await prisma.cooldown.upsert({
    where: { userId_kind: { userId, kind } },
    update: { endsAt: new Date(Date.now() + ms) },
    create: { userId, kind, endsAt: new Date(Date.now() + ms) },
  });
}

function randomBorder() {
  const span = WORLD_BORDER * 2;
  const x = Math.floor(Math.random() * span) - WORLD_BORDER;
  const z = Math.floor(Math.random() * span) - WORLD_BORDER;
  return { x, z, dimension: OVERWORLD };
}

async function findRtp(world) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { x, z } = randomBorder();
    const chunk = await world.getChunk(OVERWORLD, Math.floor(x / 16), Math.floor(z / 16));
    const sf = world.findSurfaceY(OVERWORLD, x, z);
    if (sf !== null && sf > 2 && sf < WORLD_HEIGHT - 3 && world.blockAt(OVERWORLD, x, sf, z) !== 1) {
      const waterBlock = world.blockAt(OVERWORLD, x, sf, z);
      if (waterBlock === 8) continue; // avoid water spawn
      return { x: x + 0.5, y: sf + 1, z: z + 0.5, dimension: OVERWORLD };
    }
  }
  return spawnLocation();
}

function spawnLocation() {
  return { x: 8.5, y: 70, z: 8.5, dimension: OVERWORLD };
}

const TP_COOLDOWN_MS = {
  rtp: 60 * 1000,
  spawn: 10 * 1000,
  tpa: 5 * 1000,
  home: 3 * 1000,
};

module.exports = { getCooldown, setCooldown, randomBorder, findRtp, spawnLocation, TP_COOLDOWN_MS };
