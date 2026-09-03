const prisma = require("../db");
const economy = require("./economy");
const { REGION_BY_KEY, regionAt } = require("../game/regions");

const KINDS = ["HOME", "SHOP", "WAREHOUSE", "FACTORY", "FARM", "WORKSHOP", "COMMERCIAL"];

// Purchase a property (land) at a location.
async function buyProperty(playerId, regionKey, kind, name, x, y, sizeW, sizeH) {
  if (!KINDS.includes(kind)) throw new Error("Unknown property kind");
  const region = REGION_BY_KEY[regionKey];
  if (!region) throw new Error("Unknown region");

  // price scales by size and whether it's near central commercial zones
  const size = (sizeW || 2) * (sizeH || 2);
  const base = kind === "COMMERCIAL" ? 800 : 400;
  const value = base * size * (region.kind === "CITY" ? 3 : region.kind === "TOWN" ? 2 : 1);

  await economy.paySystem(playerId, BigInt(value), "PROPERTY", `Bought ${name}`);
  return prisma.property.create({
    data: { ownerId: playerId, regionKey, kind, name, x, y, sizeW: sizeW || 2, sizeH: sizeH || 2, value: BigInt(value) },
  });
}

async function myProperties(playerId) {
  return prisma.property.findMany({ where: { ownerId: playerId } });
}

// Build on owned property (or on land you own).
async function build(playerId, propertyId, kind, name, x, y) {
  if (!KINDS.includes(kind)) throw new Error("Unknown building kind");
  const prop = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!prop || prop.ownerId !== playerId) throw new Error("Property not owned");
  const building = await prisma.building.create({
    data: { ownerId: playerId, propertyId, kind, name, x, y },
  });
  // stats
  const stats = require("./stats");
  await stats.addStat(playerId, "buildingsBuilt", 1);
  return building;
}

module.exports = { buyProperty, myProperties, build, KINDS };
