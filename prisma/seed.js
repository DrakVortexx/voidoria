const { PrismaClient } = require("@prisma/client");
const { ensureAdmin } = require("./startup");
const world = require("../server/services/world");
const shop = require("../server/services/shop");

const prisma = new PrismaClient();

async function seed() {
  console.log("Resetting database...");

  await prisma.pricePoint.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.marketOrder.deleteMany();
  await prisma.auctionBid.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.shopListing.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.shopPlot.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.tradeOffer.deleteMany();
  await prisma.transportContract.deleteMany();
  await prisma.deliveryJob.deleteMany();
  await prisma.productionJob.deleteMany();
  await prisma.productionFacility.deleteMany();
  await prisma.businessMember.deleteMany();
  await prisma.business.deleteMany();
  await prisma.building.deleteMany();
  await prisma.property.deleteMany();
  await prisma.crate.deleteMany();
  await prisma.bounty.deleteMany();
  await prisma.inventoryStack.deleteMany();
  await prisma.playerStat.deleteMany();
  await prisma.resourceNode.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.playerSetting.deleteMany();
  await prisma.playerProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.worldRegion.deleteMany();

  await ensureAdmin();
  await world.seedWorld();
  await shop.seedPlots();

  console.log("Database seeding complete!");
}

seed()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
