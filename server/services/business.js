const prisma = require("../db");
const economy = require("./economy");
const production = require("./production");

const TYPES = ["MINING", "LUMBER", "MANUFACTURING", "CONSTRUCTION", "TRANSPORT", "TRADING", "RETAIL", "AGRICULTURE", "LOGISTICS"];

// Create a business; the founder becomes OWNER (sole member).
async function create(playerId, name, businessType) {
  if (!name || !name.trim()) throw new Error("Business needs a name");
  if (!TYPES.includes(businessType)) throw new Error("Unknown business type");
  const cost = 2000n;
  await economy.paySystem(playerId, cost, "BUSINESS", `Founded ${name}`);
  await prisma.$transaction(async (tx) => {
    const biz = await tx.business.create({ data: { ownerId: playerId, name: name.trim(), businessType } });
    await tx.businessMember.create({ data: { businessId: biz.id, playerId, role: "OWNER" } });
    // give the founder a starter facility tied to the business
    await tx.productionFacility.create({
      data: { businessId: biz.id, ownerId: playerId, kind: "WORKSHOP", name: `${name} Workshop`, x: 0, y: 0 },
    });
  });
  return true;
}

async function invite(businessId, ownerId, playerId, role = "MEMBER") {
  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz) throw new Error("Business not found");
  if (biz.ownerId !== ownerId) throw new Error("Only the owner can invite");
  const existing = await prisma.businessMember.findUnique({
    where: { businessId_playerId: { businessId, playerId } },
  });
  if (existing) throw new Error("Already a member");
  await prisma.businessMember.create({ data: { businessId, playerId, role } });
  return true;
}

async function removeMember(businessId, ownerId, playerId) {
  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz) throw new Error("Business not found");
  if (biz.ownerId !== ownerId) throw new Error("Only the owner can remove members");
  if (biz.ownerId === playerId) throw new Error("Owner cannot remove themselves");
  await prisma.businessMember.deleteMany({ where: { businessId, playerId } });
  return true;
}

async function myBusinesses(playerId) {
  const memberships = await prisma.businessMember.findMany({
    where: { playerId },
    include: { business: { include: { facilities: true } } },
  });
  return memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    type: m.business.businessType,
    role: m.role,
    owner: m.business.ownerId,
    facilities: m.business.facilities.map((f) => ({
      id: f.id, kind: f.kind, name: f.name, x: f.x, y: f.y, capacity: f.capacity,
    })),
  }));
}

async function members(businessId) {
  const rows = await prisma.businessMember.findMany({
    where: { businessId },
    include: { player: { select: { displayName: true } } },
  });
  return rows.map((r) => ({ id: r.playerId, name: r.player.displayName, role: r.role }));
}

module.exports = { create, invite, removeMember, myBusinesses, members, TYPES };
