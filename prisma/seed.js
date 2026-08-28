const { PrismaClient } = require("@prisma/client");
const { ITEMS, seedCatalog, ensureAdmin } = require("./bootstrap");

const prisma = new PrismaClient();

async function seed() {
  console.log("Seeding database...");

  await prisma.tradeItem.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.auctionListing.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.shopListing.deleteMany();
  await prisma.item.deleteMany();
  await prisma.session.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();

  await seedCatalog(prisma);

  const result = await ensureAdmin();
  console.log(`Seeded ${ITEMS.length} items + admin user.`);

  if (result.created) {
    printAdminInfo(result);
  }

  console.log("Database seeding complete!");
}

function printAdminInfo(result) {
  if (result.generated) {
    console.log("Admin credentials (generated):");
    console.log(`  username: ${result.username}`);
    console.log(`  password: ${result.password}`);
    console.log("Store this password now; it will not be shown again.");
  } else {
    console.log(`Admin user created from ADMIN_PASSWORD env var.`);
  }
}

seed()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());