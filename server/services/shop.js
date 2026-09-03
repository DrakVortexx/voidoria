const prisma = require("../db");
const { getItem } = require("../game/items");
const economy = require("./economy");
const inventory = require("./inventory");
const { REGIONS } = require("../game/regions");

const BIG = (n) => BigInt(Math.trunc(Number(n)));

// Predefined shop plots. Boundaries are immutable — players customize interior
// + inventory, not size/location. Each plot is tied to a commercial area.
const PLOTS = [
  // Central commercial district (city)
  { plotKey: "central-01", regionKey: "city-west", name: "North Market Stall",  x: -40, y: -4, sizeW: 4, sizeH: 4, baseValue: 5000,  commercialPremium: 1.4 },
  { plotKey: "central-02", regionKey: "city-west", name: "Goldsmith Corner",     x: -42, y: 2,  sizeW: 4, sizeH: 4, baseValue: 5000,  commercialPremium: 1.4 },
  { plotKey: "central-03", regionKey: "city-east", name: "East Trade House",     x: 42,  y: 8,  sizeW: 5, sizeH: 5, baseValue: 5500,  commercialPremium: 1.3 },
  { plotKey: "central-04", regionKey: "city",       name: "Centre Emporium",     x: 2,   y: 3,  sizeW: 6, sizeH: 6, baseValue: 8000,  commercialPremium: 1.6 },
  { plotKey: "central-05", regionKey: "city",       name: "Citizens Market",     x: -2,  y: -4, sizeW: 5, sizeH: 5, baseValue: 6000,  commercialPremium: 1.5 },

  // Town plots
  { plotKey: "northville-01", regionKey: "northville", name: "Northville General", x: -3, y: -160, sizeW: 4, sizeH: 4, baseValue: 3000, commercialPremium: 1.0 },
  { plotKey: "southport-01",  regionKey: "southport",  name: "Southport Trade",    x: 3,  y: 170,  sizeW: 4, sizeH: 4, baseValue: 3000, commercialPremium: 1.0 },
  { plotKey: "eastbrook-01",  regionKey: "eastbrook",  name: "Eastbrook Hall",     x: 180, y: 2,   sizeW: 4, sizeH: 4, baseValue: 3000, commercialPremium: 1.0 },

  // Distinctive commerce plot
  { plotKey: "luxe-01", regionKey: "city", name: "The Luxe Merchant", x: 6, y: -6, sizeW: 4, sizeH: 4, baseValue: 9000, commercialPremium: 2.0 },
];

// Seed the immutable plot definitions (boundaries). Runs at startup.
async function seedPlots() {
  for (const p of PLOTS) {
    const existing = await prisma.shopPlot.findUnique({ where: { plotKey: p.plotKey } });
    if (existing) continue;
    await prisma.shopPlot.create({
      data: {
        plotKey: p.plotKey, regionKey: p.regionKey, name: p.name,
        sizeW: p.sizeW, sizeH: p.sizeH,
        baseValue: BIG(p.baseValue), commercialPremium: p.commercialPremium,
        x: p.x, y: p.y,
      },
    });
  }
}

async function listPlots() {
  return prisma.shopPlot.findMany({ orderBy: { plotKey: "asc" } });
}

// Purchase a plot (create the Shop record bound to the immutable plot).
async function purchasePlot(playerId, plotKey, shopName) {
  const plot = await prisma.shopPlot.findUnique({ where: { plotKey } });
  if (!plot) throw new Error("Plot not found");
  const existingShop = await prisma.shop.findUnique({ where: { plotId: plot.id } });
  if (existingShop) throw new Error("Plot already owned");

  const cost = BIG(Number(plot.baseValue) * plot.commercialPremium);

  await prisma.$transaction(async (tx) => {
    await economy.deduct(playerId, cost, { tx });
    await economy.recordTransfer(playerId, null, cost, "SHOP_PLOT", `Purchased plot ${plot.name}`, { tx });
    const shop = await tx.shop.create({
      data: {
        playerId, plotId: plot.id,
        name: shopName || plot.name,
      },
    });
    return shop;
  });
  return prisma.shop.findUnique({
    where: { plotId: plot.id },
    include: { plot: true, listings: true },
  });
}

async function getMyShop(playerId) {
  return prisma.shop.findUnique({
    where: { playerId },
    include: { plot: true, listings: true },
  });
}

async function getShopByKey(plotKey) {
  const plot = await prisma.shopPlot.findUnique({ where: { plotKey } });
  if (!plot) return null;
  return prisma.shop.findUnique({
    where: { plotId: plot.id },
    include: { plot: true, listings: true },
  });
}

async function customizeShop(playerId, { name, sign, shopkeeper, interior }) {
  const shop = await prisma.shop.findUnique({ where: { playerId } });
  if (!shop) throw new Error("You do not own a shop");
  return prisma.shop.update({
    where: { id: shop.id },
    data: {
      name: name !== undefined ? name : shop.name,
      sign: sign !== undefined ? sign : shop.sign,
      shopkeeper: shopkeeper !== undefined ? shopkeeper : shop.shopkeeper,
      interior: interior !== undefined ? interior : shop.interior,
    },
  });
}

// Add a listing selling your inventory items at a price.
async function addListing(playerId, itemDef, quantity, price) {
  const shop = await prisma.shop.findUnique({ where: { playerId } });
  if (!shop) throw new Error("You do not own a shop");
  if (!getItem(itemDef)) throw new Error("Unknown item");
  if (quantity <= 0) throw new Error("Invalid quantity");
  price = Math.trunc(Number(price));
  if (price <= 0) throw new Error("Invalid price");

  await prisma.$transaction(async (tx) => {
    // stock is deducted and stored in the listing
    await inventory.removeItem(playerId, itemDef, quantity, { tx });
    await tx.shopListing.create({
      data: {
        shopId: shop.id, itemDef, price: BIG(price), quantity,
      },
    });
  });
  return true;
}

async function removeListing(playerId, listingId) {
  const shop = await prisma.shop.findUnique({ where: { playerId } });
  if (!shop) throw new Error("You do not own a shop");
  const listing = await prisma.shopListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.shopId !== shop.id) throw new Error("Listing not found");
  await prisma.$transaction(async (tx) => {
    const remaining = listing.quantity - listing.sold;
    await tx.shopListing.delete({ where: { id: listingId } });
    if (remaining > 0) await inventory.addItem(playerId, listing.itemDef, remaining, { tx });
  });
  return true;
}

// Purchase from a shop (any player) — atomic, server-authoritative.
async function purchase(playerId, listingId, quantity = 1) {
  const listing = await prisma.shopListing.findUnique({ where: { id: listingId }, include: { shop: true } });
  if (!listing || !listing.enabled) throw new Error("Listing not available");
  if (quantity <= 0) throw new Error("Invalid quantity");
  const available = listing.quantity - listing.sold;
  if (quantity > available) throw new Error("Not enough stock in shop");
  if (listing.shop.playerId === playerId) throw new Error("Cannot buy from your own shop");

  const total = BIG(listing.price) * BIG(quantity);
  await prisma.$transaction(async (tx) => {
    // seller receives funds
    await economy.deduct(playerId, total, { tx });
    await economy.credit(listing.shop.playerId, BIG(total), { tx });
    await economy.recordTransfer(playerId, listing.shop.playerId, total, "SHOP_PURCHASE", `Bought ${quantity} x ${listing.itemDef}`, { tx });
    await tx.shopListing.update({
      where: { id: listingId },
      data: { sold: { increment: quantity } },
    });
    await inventory.addItem(playerId, listing.itemDef, quantity, { tx });
  });
  return true;
}

async function allShops() {
  const shops = await prisma.shop.findMany({ include: { plot: true, listings: true } });
  return shops.map((s) => ({
    id: s.id, name: s.name, sign: s.sign, shopkeeper: s.shopkeeper,
    plotKey: s.plot.plotKey, regionKey: s.plot.regionKey,
    x: s.plot.x, y: s.plot.y, interior: s.interior,
    ownerName: s.playerId ? null : null,
    listings: s.listings.filter((l) => l.enabled && l.quantity - l.sold > 0).map((l) => ({
      id: l.id, itemDef: l.itemDef, price: Number(l.price), quantity: l.quantity - l.sold,
      name: getItem(l.itemDef)?.name, icon: getItem(l.itemDef)?.icon,
    })),
  }));
}

module.exports = { seedPlots, listPlots, purchasePlot, getMyShop, getShopByKey, customizeShop, addListing, removeListing, purchase, allShops, PLOTS };
