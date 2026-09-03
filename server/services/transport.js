const prisma = require("../db");
const { REGION_BY_KEY } = require("../game/regions");
const { getItem } = require("../game/items");
const economy = require("./economy");
const inventory = require("./inventory");
const stats = require("./stats");

// Accept a transport contract to move items between regions for a reward.
async function acceptContract(playerId, fromRegion, toRegion, itemDef, quantity, reward) {
  if (!REGION_BY_KEY[fromRegion] || !REGION_BY_KEY[toRegion]) throw new Error("Unknown region");
  if (!getItem(itemDef)) throw new Error("Unknown item");
  if (quantity <= 0) throw new Error("Invalid quantity");
  quantity = Math.min(quantity, 100);
  reward = Math.trunc(Number(reward)) || 100;

  // carrier must have the goods
  if (!(await inventory.hasItem(playerId, itemDef, quantity))) throw new Error("You do not carry enough of that item");
  // remove from their inventory (in transit)
  await inventory.removeItem(playerId, itemDef, quantity);
  return prisma.transportContract.create({
    data: { playerId, fromRegion, toRegion, itemDef, quantity, reward: BigInt(reward) },
  });
}

// Deliver the contract once the player reaches the destination region.
async function deliverContract(playerId, contractId, currentRegion) {
  const contract = await prisma.transportContract.findUnique({ where: { id: contractId } });
  if (!contract || contract.playerId !== playerId) throw new Error("Contract not found");
  if (contract.status !== "ACCEPTED") throw new Error("Contract already completed");
  if (currentRegion !== contract.toRegion) throw new Error("You are not at the destination yet");

  await prisma.$transaction(async (tx) => {
    const upd = await tx.transportContract.updateMany({
      where: { id: contractId, status: "ACCEPTED", playerId },
      data: { status: "DELIVERED" },
    });
    if (upd.count === 0) throw new Error("Contract already completed");
    await economy.creditSystem(playerId, contract.reward, "TRANSPORT", `Delivered ${contract.itemDef}`, { tx });
    await stats.addStat(playerId, "tradesCompleted", 1, { tx });
  });
  return Number(contract.reward);
}

async function myContracts(playerId) {
  return prisma.transportContract.findMany({ where: { playerId }, orderBy: { createdAt: "desc" } });
}

// Simple delivery job between two coordinates.
async function acceptDelivery(playerId, fromX, fromY, toX, toY, reward) {
  reward = Math.trunc(Number(reward)) || 80;
  return prisma.deliveryJob.create({
    data: { playerId, fromX, fromY, toX, toY, reward: BigInt(reward) },
  });
}

async function deliver(playerId, jobId, x, y) {
  const job = await prisma.deliveryJob.findUnique({ where: { id: jobId } });
  if (!job || job.playerId !== playerId) throw new Error("Job not found");
  if (job.status !== "ACTIVE") throw new Error("Job already completed");
  if (Math.hypot(job.toX - x, job.toY - y) > 3) throw new Error("You are not at the destination");
  await prisma.$transaction(async (tx) => {
    const upd = await tx.deliveryJob.updateMany({
      where: { id: jobId, status: "ACTIVE", playerId },
      data: { status: "DELIVERED" },
    });
    if (upd.count === 0) throw new Error("Job already completed");
    await economy.creditSystem(playerId, job.reward, "TRANSPORT", "Delivery completed", { tx });
  });
  return Number(job.reward);
}

module.exports = { acceptContract, deliverContract, myContracts, acceptDelivery, deliver };
