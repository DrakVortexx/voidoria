const { PrismaClient } = require("@prisma/client");
const { ITEMS, seedCatalog, ensureAdmin, ADMIN_USERNAME } = require("./bootstrap");

const prisma = new PrismaClient();

async function startup() {
  try {
    const itemCount = await prisma.item.count();
    if (itemCount === 0) {
      console.log("Database empty, seeding catalog...");
      await seedCatalog(prisma);
      console.log(`Seeded ${ITEMS.length} items.`);
    } else {
      console.log(`Database already seeded (${itemCount} items).`);
    }

    const admin = await ensureAdmin();
    if (admin.created) {
      if (admin.generated) {
        console.log(`Created admin user '${ADMIN_USERNAME}' with generated password.`);
        console.log(`  username: ${admin.username}`);
        console.log(`  password: ${admin.password}`);
        console.log("Store this password now; it will not be shown again.");
      } else {
        console.log(`Admin user '${ADMIN_USERNAME}' created from ADMIN_PASSWORD env var.`);
      }
    }
  } catch (err) {
    console.error("Startup seed error:", err);
  }
}

module.exports = { startup };