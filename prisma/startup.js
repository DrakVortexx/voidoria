const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { CATEGORIES, DEFAULT_LISTINGS, listingIdKey } = require("../server/world/catalogSeed");
const { ADMIN_USERNAME } = require("../server/config");

const prisma = new PrismaClient();

async function startup() {
  await seedShop();
  await ensureAdmin();
  await expireAuctionItems();
  console.log("Voidoria startup complete.");
}

async function seedShop() {
  for (const c of CATEGORIES) {
    await prisma.shopCategory.upsert({
      where: { id: c.id },
      update: { name: c.name },
      create: { id: c.id, name: c.name },
    });
  }
  for (const [itemType, buy, sell, cat, available] of DEFAULT_LISTINGS) {
    const id = listingIdKey(itemType);
    await prisma.shopListing.upsert({
      where: { id },
      update: { buyPrice: BigInt(buy), sellPrice: BigInt(sell), available, categoryId: cat },
      create: { id, itemType, buyPrice: BigInt(buy), sellPrice: BigInt(sell), available, categoryId: cat },
    });
  }
}

async function expireAuctionItems() {
  const expired = await prisma.auctionListing.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
  });
  for (const l of expired) {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.auctionListing.updateMany({
        where: { id: l.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (locked.count === 0) return;
      const { addItem } = require("../server/services/inventory");
      await addItem(l.sellerId, l.itemType, l.quantity, { tx });
    });
  }
}

async function createInitialState(userId, username) {
  const profile = await prisma.playerProfile.create({
    data: {
      userId,
      displayName: username,
      appearance: defaultAppearance(),
      posX: 8.5, posY: 70, posZ: 8.5,
    },
  });
  await prisma.playerSetting.create({ data: { userId } });
  await prisma.balance.create({ data: { playerId: profile.id, amount: BigInt(10000) } });
  const { addItem } = require("../server/services/inventory");
  const STARTER = [
    ["block:planks", 32], ["block:cobblestone", 32],
    ["item:stone_pickaxe", 1], ["item:stone_axe", 1], ["item:stone_sword", 1],
    ["item:bread", 8], ["item:coal", 8],
  ];
  for (const [t, n] of STARTER) await addItem(profile.id, t, n);
  return profile;
}

async function ensureAdmin() {
  const existing = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
    include: { profile: true },
  });
  if (existing) {
    if (!existing.profile) await createInitialState(existing.id, existing.username);
    return { created: false };
  }

  const envPass = process.env.ADMIN_PASSWORD;
  const useEnv = typeof envPass === "string" && envPass.length >= 8;
  const password = useEnv ? envPass : crypto.randomBytes(24).toString("base64url");
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({ data: { username: ADMIN_USERNAME, passwordHash } });
  await createInitialState(user.id, user.username);

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

async function seedCatalogAndShop() {
  await seedShop();
}

module.exports = { startup, seedShop, ensureAdmin, createInitialState, seedCatalogAndShop };
