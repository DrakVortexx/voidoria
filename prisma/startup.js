const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { ADMIN_USERNAME } = require("../server/config");
const world = require("../server/services/world");
const shop = require("../server/services/shop");

const prisma = new PrismaClient();

async function startup() {
  await ensureAdmin();
  await world.seedWorld();
  await shop.seedPlots();
  await require("../server/services/auction").settleExpired();
  console.log("Voidoria startup complete.");
}

async function initializeAdminUser(userId, username) {
  const profile = await prisma.playerProfile.create({
    data: {
      userId,
      displayName: username,
      appearance: defaultAppearance(),
      posX: 0, posY: 0,
    },
  });
  await prisma.playerSetting.create({ data: { userId } });
  await require("../server/services/profile").initializePlayer(profile.id);
  return profile;
}

async function ensureAdmin() {
  const existing = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
    include: { profile: true },
  });
  if (existing) {
    if (!existing.profile) await initializeAdminUser(existing.id, existing.username);
    return { created: false };
  }

  const envPass = process.env.ADMIN_PASSWORD;
  const useEnv = typeof envPass === "string" && envPass.length >= 8;
  const password = useEnv ? envPass : crypto.randomBytes(24).toString("base64url");
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({ data: { username: ADMIN_USERNAME, passwordHash: hash } });
  await initializeAdminUser(user.id, user.username);

  if (!useEnv) {
    console.log(`Admin user '${ADMIN_USERNAME}' created with password: ${password}`);
    console.log("Store this password now; it will not be shown again.");
  } else {
    console.log(`Admin user '${ADMIN_USERNAME}' configured from ADMIN_PASSWORD env var.`);
  }
  return { created: true, username: ADMIN_USERNAME, password, generated: !useEnv };
}

function defaultAppearance() {
  return {
    skinTone: "#e0ac69", hairStyle: "short", hairColor: "#3b2a1a",
    face: "default", shirtColor: "#2e7d9a", pantsColor: "#3f4c66",
    shoesColor: "#2b2b2b", accessory: "none",
  };
}

module.exports = { startup, ensureAdmin };
