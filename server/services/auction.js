const prisma = require("../db");
const { getItem } = require("../game/items");
const economy = require("./economy");
const inventory = require("./inventory");

const BIG = (n) => BigInt(Math.trunc(Number(n)));

function defaultDuration() {
  return 24 * 3600 * 1000; // 24h
}

// Create an auction listing, deducting the item from inventory.
async function create(playerId, itemDef, quantity, startPrice, buyoutPrice, durationMs) {
  if (!getItem(itemDef)) throw new Error("Unknown item");
  if (quantity <= 0) throw new Error("Invalid quantity");
  startPrice = Math.trunc(Number(startPrice));
  if (startPrice <= 0) throw new Error("Invalid start price");
  buyoutPrice = buyoutPrice ? Math.trunc(Number(buyoutPrice)) : null;
  if (buyoutPrice && buyoutPrice < startPrice) throw new Error("Buyout cannot be below start");

  await prisma.$transaction(async (tx) => {
    await inventory.removeItem(playerId, itemDef, quantity, { tx });
    await tx.auction.create({
      data: {
        sellerId: playerId, itemDef, quantity,
        startPrice: BIG(startPrice), buyoutPrice: buyoutPrice ? BIG(buyoutPrice) : null,
        expiresAt: new Date(Date.now() + (durationMs || defaultDuration())),
      },
    });
  });
  return true;
}

// Place a bid: validate, then atomically move the previous high bidder's locked
// funds back and lock the new bidder's funds (min bid increment = 5%).
async function bid(playerId, auctionId, amount) {
  amount = Math.trunc(Number(amount));
  if (amount <= 0) throw new Error("Invalid bid amount");

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status !== "ACTIVE") throw new Error("Auction is not active");
  if (auction.sellerId === playerId) throw new Error("Cannot bid on your own auction");
  if (auction.expiresAt < new Date()) throw new Error("Auction has expired");
  if (auction.buyoutPrice && amount >= Number(auction.buyoutPrice)) {
    // Treat as a buyout
    return buyout(playerId, auctionId);
  }
  const minBid = auction.currentBid > 0n
    ? Number(auction.currentBid) + Math.max(1, Math.floor(Number(auction.currentBid) * 0.05))
    : Math.max(Number(auction.startPrice), Math.floor(Number(auction.startPrice) * 1.05));
  if (amount < minBid) throw new Error(`Bid must be at least ${minBid}`);

  await prisma.$transaction(async (tx) => {
    // refund previous highest bidder (if any)
    const prevBidderId = auction.bidderId;
    const prevBid = auction.currentBid;
    if (prevBidderId && prevBid > 0n) {
      const upd = await tx.auction.updateMany({
        where: { id: auctionId, bidderId: prevBidderId, currentBid: prevBid, status: "ACTIVE" },
        data: { bidderId: playerId, currentBid: BIG(amount) },
      });
      if (upd.count === 0) throw new Error("Auction changed; please retry");
      await economy.credit(prevBidderId, prevBid, { tx });
    } else {
      const upd = await tx.auction.updateMany({
        where: { id: auctionId, currentBid: 0n, status: "ACTIVE" },
        data: { bidderId: playerId, currentBid: BIG(amount) },
      });
      if (upd.count === 0) throw new Error("Auction changed; please retry");
    }
    // lock new bidder's funds
    await economy.deduct(playerId, BIG(amount), { tx });
    await economy.recordTransfer(playerId, null, BIG(amount), "AUCTION_BID", `Bid ${amount} on ${auction.itemDef}`, { tx });
    await tx.auctionBid.create({ data: { auctionId, bidderId: playerId, amount: BIG(amount) } });
  });
  return { currentBid: amount };
}

// Buyout at the listed buyout price.
async function buyout(playerId, auctionId) {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status !== "ACTIVE") throw new Error("Auction is not active");
  if (!auction.buyoutPrice) throw new Error("No buyout available");
  if (auction.sellerId === playerId) throw new Error("Cannot buy your own auction");
  if (auction.expiresAt < new Date()) throw new Error("Auction has expired");

  const price = auction.buyoutPrice;
  const prevBidderId = auction.bidderId;
  const prevBid = auction.currentBid;

  await prisma.$transaction(async (tx) => {
    const upd = await tx.auction.updateMany({
      where: { id: auctionId, status: "ACTIVE" },
      data: { status: "SOLD", soldAt: new Date(), bidderId: playerId, currentBid: price },
    });
    if (upd.count === 0) throw new Error("Auction already closed");

    await economy.deduct(playerId, price, { tx });

    // refund previous highest bidder's locked funds
    if (prevBidderId && prevBid > 0n) {
      await economy.credit(prevBidderId, BIG(prevBid), { tx });
      await economy.recordTransfer(null, prevBidderId, BIG(prevBid), "AUCTION_REFUND", "Bid refund", { tx });
    }
    // pay seller (price, minus 2% listing fee into the void)
    const sellerShare = price - BIG(Math.floor(Number(price) * 0.02));
    await economy.credit(auction.sellerId, sellerShare, { tx });
    await economy.recordTransfer(playerId, auction.sellerId, sellerShare, "AUCTION", `Buyout ${auction.itemDef}`, { tx });
    await inventory.addItem(playerId, auction.itemDef, auction.quantity, { tx });
    await tx.auctionBid.create({ data: { auctionId, bidderId: playerId, amount: price } });
  });
  return true;
}

// Settle expired auctions (deliver to highest bidder or return to seller).
async function settleExpired() {
  const expired = await prisma.auction.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
  });
  for (const a of expired) {
    await prisma.$transaction(async (tx) => {
      const upd = await tx.auction.updateMany({
        where: { id: a.id, status: "ACTIVE" },
        data: { status: a.bidderId ? "SOLD" : "EXPIRED", soldAt: a.bidderId ? new Date() : null },
      });
      if (upd.count === 0) return;
      if (a.bidderId) {
        // highest bidder already paid (funds locked); deliver item & pay seller
        const sellerShare = a.currentBid - BIG(Math.floor(Number(a.currentBid) * 0.02));
        await economy.credit(a.sellerId, sellerShare, { tx });
        await economy.recordTransfer(null, a.sellerId, sellerShare, "AUCTION", `won ${a.itemDef}`, { tx });
        await inventory.addItem(a.bidderId, a.itemDef, a.quantity, { tx });
      } else {
        // no bid: return item to seller
        await inventory.addItem(a.sellerId, a.itemDef, a.quantity, { tx });
      }
    });
  }
  return expired.length;
}

async function active() {
  const rows = await prisma.auction.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "asc" },
    include: { seller: { select: { displayName: true } } },
    take: 100,
  });
  return rows.map((a) => ({
    id: a.id, itemDef: a.itemDef, quantity: a.quantity,
    name: getItem(a.itemDef)?.name, icon: getItem(a.itemDef)?.icon,
    startPrice: Number(a.startPrice), buyoutPrice: a.buyoutPrice ? Number(a.buyoutPrice) : null,
    currentBid: Number(a.currentBid), seller: a.seller.displayName,
    expiresAt: a.expiresAt,
  }));
}

module.exports = { create, bid, buyout, settleExpired, active };
