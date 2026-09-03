const prisma = require("../db");
const economy = require("./economy");
const inventory = require("./inventory");

// ---------- Friends (User-level, per auth core) ----------

async function addFriend(userId, otherUserId) {
  if (userId === otherUserId) throw new Error("Cannot friend yourself");
  const low = userId < otherUserId ? userId : otherUserId;
  const high = userId < otherUserId ? otherUserId : userId;
  const existing = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: low, userBId: high } } });
  if (existing) throw new Error("Already friends / pending");
  return prisma.friendship.create({ data: { userAId: low, userBId: high } });
}

async function acceptFriend(userId, otherUserId) {
  await prisma.friendship.updateMany({ where: { userAId: otherUserId, userBId: userId, status: "PENDING" }, data: { status: "ACCEPTED" } });
}

async function removeFriend(userId, otherUserId) {
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userAId: userId, userBId: otherUserId },
        { userAId: otherUserId, userBId: userId },
      ],
    },
  });
}

async function friendList(userId) {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: { include: { profile: { select: { displayName: true } } } },
      userB: { include: { profile: { select: { displayName: true } } } },
    },
  });
  return rows.map((r) => {
    const isA = r.userAId === userId;
    const otherUser = isA ? r.userB : r.userA;
    return {
      friendId: otherUser.id,
      name: otherUser.profile?.displayName || otherUser.username,
      status: r.status,
      direction: isA ? "outgoing" : "incoming",
    };
  });
}

// ---------- Trade offers (Profile-level) ----------

// Offer: { items: [{itemDef, qty}], currency: number }
async function createOffer(playerId, targetId, offer, request) {
  const profile = await prisma.playerProfile.findUnique({ where: { id: targetId } });
  if (!profile) throw new Error("Target player not found");
  if (playerId === targetId) throw new Error("Cannot trade with yourself");
  const me = await prisma.playerProfile.findUnique({ where: { id: playerId } });
  return prisma.tradeOffer.create({
    data: { fromId: playerId, toId: targetId, offer: offer || {}, request: request || {} },
  });
}

// Accept a trade offer — swaps offered items + currency atomically.
async function acceptOffer(playerId, offerId) {
  const offer = await prisma.tradeOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.toId !== playerId) throw new Error("Offer not found");
  if (offer.status !== "PENDING") throw new Error("Offer already resolved");

  const offerItems = offer.offer.items || [];
  const offerCash = Number(offer.offer.currency) || 0;
  const requestItems = offer.request.items || [];
  const requestCash = Number(offer.request.currency) || 0;

  await prisma.$transaction(async (tx) => {
    const upd = await tx.tradeOffer.updateMany({ where: { id: offerId, status: "PENDING", toId: playerId }, data: { status: "ACCEPTED" } });
    if (upd.count === 0) throw new Error("Offer already resolved");

    // sender (fromId) gives offer.items + offerCash; receives request.items + requestCash
    for (const it of offerItems) await inventory.removeItem(offer.fromId, it.itemDef, it.qty, { tx });
    for (const it of requestItems) await inventory.removeItem(playerId, it.itemDef, it.qty, { tx });
    if (offerCash > 0) await economy.deduct(offer.fromId, offerCash, { tx });
    if (requestCash > 0) await economy.deduct(playerId, requestCash, { tx });

    for (const it of offerItems) await inventory.addItem(playerId, it.itemDef, it.qty, { tx });
    for (const it of requestItems) await inventory.addItem(offer.fromId, it.itemDef, it.qty, { tx });
    if (offerCash > 0) await economy.credit(playerId, offerCash, { tx });
    if (requestCash > 0) await economy.credit(offer.fromId, requestCash, { tx });

    await tx.trade.create({ data: { playerAId: offer.toId, playerBId: offer.fromId, offerA: offer.request, offerB: offer.offer } });
  });
  return true;
}

async function declineOffer(playerId, offerId) {
  await prisma.tradeOffer.updateMany({ where: { id: offerId, toId: playerId, status: "PENDING" }, data: { status: "DECLINED" } });
}

async function cancelOffer(playerId, offerId) {
  await prisma.tradeOffer.updateMany({ where: { id: offerId, fromId: playerId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

async function myOffers(playerId) {
  const incoming = await prisma.tradeOffer.findMany({ where: { toId: playerId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  return incoming;
}

module.exports = { addFriend, acceptFriend, removeFriend, friendList, createOffer, acceptOffer, declineOffer, cancelOffer, myOffers };
