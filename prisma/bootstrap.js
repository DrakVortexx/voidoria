const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { ADMIN_USERNAME } = require("../server/config");

const prisma = new PrismaClient();

const ITEMS = [
  { name: "Worn Talisman", description: "A faded talisman from a forgotten age. It hums faintly.", rarity: "COMMON", basePrice: 25, type: "RELIC" },
  { name: "Cracked Amulet", description: "An amulet with its magic mostly spent. Still warm to the touch.", rarity: "COMMON", basePrice: 30, type: "RELIC" },
  { name: "Rusty Compass", description: "Points toward something. You're not sure what.", rarity: "COMMON", basePrice: 20, type: "GENERAL" },
  { name: "Faded Map Fragment", description: "Part of a map to somewhere important. The rest is lost.", rarity: "COMMON", basePrice: 15, type: "GENERAL" },
  { name: "Chipped Rune Stone", description: "An ancient stone with faint runes. Their meaning is forgotten.", rarity: "COMMON", basePrice: 35, type: "RELIC" },

  { name: "Seer's Eye", description: "A gemstone that reveals hidden truths when held to the light.", rarity: "RARE", basePrice: 80, type: "RELIC" },
  { name: "Storm Pendant", description: "Crackles with contained lightning. Handle with extreme care.", rarity: "RARE", basePrice: 100, type: "RELIC" },
  { name: "Shadow Veil", description: "A cloth that bends light around the wearer. Almost invisible.", rarity: "RARE", basePrice: 120, type: "COSMETIC" },
  { name: "Bloodstone Ring", description: "Pulses with stolen vitality. The previous owner is unknown.", rarity: "RARE", basePrice: 90, type: "RELIC" },
  { name: "Ember Core", description: "A warm stone that never cools. It remembers the forge.", rarity: "RARE", basePrice: 110, type: "RELIC" },

  { name: "Void Shard", description: "A fragment of empty space. Looking at it makes your eyes water.", rarity: "EPIC", basePrice: 300, type: "RELIC" },
  { name: "Dragon's Heart", description: "The preserved heart of an ancient wyrm. Still beats.", rarity: "EPIC", basePrice: 350, type: "RELIC" },
  { name: "Timepiece of Ages", description: "Slows time in a small radius. Seconds feel like minutes.", rarity: "EPIC", basePrice: 400, type: "RELIC" },
  { name: "Obsidian Mirror", description: "Shows the death of anyone reflected. You never look twice.", rarity: "EPIC", basePrice: 320, type: "RELIC" },

  { name: "Chrono Anchor", description: "Anchors the user outside of time. Age becomes meaningless.", rarity: "LEGENDARY", basePrice: 1000, type: "RELIC" },
  { name: "Throne Shard", description: "A piece of the first king's throne. Power radiates from it.", rarity: "LEGENDARY", basePrice: 1200, type: "RELIC" },
  { name: "Worldbreaker", description: "A hammer that shattered mountains. Now it rests.", rarity: "LEGENDARY", basePrice: 1500, type: "WEAPON" },
  { name: "The Eternal Flame", description: "Burns without fuel, forever. It cannot be extinguished.", rarity: "LEGENDARY", basePrice: 2000, type: "RELIC" },

  { name: "Ark of the First", description: "The chest that held creation's blueprints. Empty now.", rarity: "MYTHIC", basePrice: 8000, type: "RELIC" },
  { name: "Bloodmoon Sickle", description: "Forged during a rare celestial alignment. Cuts through fate.", rarity: "MYTHIC", basePrice: 10000, type: "WEAPON" },
  { name: "Titan's Rib", description: "A bone from a sleeping god. It whispers in your dreams.", rarity: "MYTHIC", basePrice: 12000, type: "RELIC" },
  { name: "The Last Word", description: "A scroll that rewrites reality. One use remains.", rarity: "MYTHIC", basePrice: 15000, type: "RELIC" },

  { name: "Whisper of the Void", description: "The sound between dimensions. Hearing it changes you.", rarity: "SECRET", basePrice: 500000, type: "RELIC" },
  { name: "Eater of Worlds", description: "A parasite that devours lesser artifacts to grow stronger.", rarity: "SECRET", basePrice: 750000, type: "RELIC" },
  { name: "The Architect's Brush", description: "Paints new objects into existence. Reality is malleable.", rarity: "SECRET", basePrice: 1000000, type: "RELIC" },

  { name: "The First Light", description: "A fragment of creation itself. It predates the universe.", rarity: "TRANSCENDENTAL", basePrice: 5000000, type: "RELIC" },
  { name: "Concept of Death", description: "A living embodiment of mortality. It watches and waits.", rarity: "TRANSCENDENTAL", basePrice: 7500000, type: "RELIC" },

  { name: "The Root", description: "The base code of reality. Hold it and you understand everything.", rarity: "OMNIVERSAL", basePrice: 25000000, type: "RELIC" },
  { name: "Everything", description: "Contains all possibilities simultaneously. Including none.", rarity: "OMNIVERSAL", basePrice: 50000000, type: "RELIC" },
];

const SHOP_MULTIPLIERS = {
  COMMON: 1,
  RARE: 1.2,
  EPIC: 1.5,
  LEGENDARY: 2,
  MYTHIC: 2.5,
  SECRET: 3,
  TRANSCENDENTAL: 3.5,
  OMNIVERSAL: 4,
};

const SHOP_STOCK = {
  COMMON: -1,
  RARE: -1,
  EPIC: 5,
  LEGENDARY: 3,
  MYTHIC: 1,
  SECRET: 1,
  TRANSCENDENTAL: 1,
  OMNIVERSAL: 1,
};

async function seedCatalog(client) {
  for (const itemData of ITEMS) {
    const item = await client.item.create({ data: itemData });

    const multiplier = SHOP_MULTIPLIERS[itemData.rarity] || 1;
    const shopPrice = Math.floor(itemData.basePrice * multiplier);

    await client.shopListing.create({
      data: {
        itemId: item.id,
        price: shopPrice,
        stock: SHOP_STOCK[itemData.rarity] ?? -1,
      },
    });
  }
}

function generatePassword() {
  return crypto.randomBytes(24).toString("base64url");
}

async function ensureAdmin() {
  const existing = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
    include: { player: true },
  });

  if (existing) {
    if (!existing.player) {
      await prisma.player.create({
        data: { userId: existing.id, coins: 10000, level: 10, xp: 500 },
      });
    }
    return { created: false };
  }

  const envPass = process.env.ADMIN_PASSWORD;
  const useEnv = typeof envPass === "string" && envPass.length >= 8;
  const password = useEnv ? envPass : generatePassword();

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      passwordHash: hash,
      player: { create: { coins: 10000, level: 10, xp: 500 } },
    },
  });

  return { created: true, username: ADMIN_USERNAME, password, generated: !useEnv };
}

module.exports = { ITEMS, SHOP_MULTIPLIERS, SHOP_STOCK, seedCatalog, ensureAdmin, ADMIN_USERNAME };