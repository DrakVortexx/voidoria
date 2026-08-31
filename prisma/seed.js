const { PrismaClient } = require("@prisma/client");
const { seedShop, ensureAdmin } = require("./startup");

const prisma = new PrismaClient();

async function seed() {
  console.log("Resetting database...");

  await prisma.cooldown.deleteMany();
  await prisma.stasisChamber.deleteMany();
  await prisma.pendingTeleport.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.bounty.deleteMany();
  await prisma.auctionListing.deleteMany();
  await prisma.inventorySlot.deleteMany();
  await prisma.balance.deleteMany();
  await prisma.playerHome.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.playerProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.shopListing.deleteMany();
  await prisma.shopCategory.deleteMany();
  await prisma.worldChunk.deleteMany();

  await seedShop();
  await ensureAdmin();

  console.log("Database seeding complete!");
}

seed()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
