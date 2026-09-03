const prisma = require("../db");
const { getItem, ITEM } = require("../game/items");
const economy = require("./economy");
const inventory = require("./inventory");

// Determine which facility kinds can run a given recipe.
function facilityFor(recipeKey) {
  const def = ITEM[recipeKey];
  return def?.facility || "workshop";
}

// Valid recipes a facility can process (product items whose recipe facility matches).
function recipesForFacility(kind) {
  return Object.entries(ITEM)
    .filter(([, d]) => d.recipe && (d.facility || "workshop") === kind)
    .map(([id, d]) => ({
      id,
      name: d.name,
      icon: d.icon,
      timeMs: d.timeMs,
      producesPerJob: d.producesPerJob,
      costs: d.recipe,
      category: d.category,
    }));
}

// Start a production job at a facility.
async function start(facilityId, playerId, recipeKey, batches = 1) {
  const def = ITEM[recipeKey];
  if (!def || !def.recipe) throw new Error("Unknown recipe");
  const facility = await prisma.productionFacility.findUnique({ where: { id: facilityId } });
  const facilityKind = facility?.kind || "workshop";
  if ((def.facility || "workshop") !== facilityKind) throw new Error(`Recipe needs a ${def.facility || "workshop"}`);

  // Only the owner can run jobs on their facility.
  if (facility.ownerId !== playerId) throw new Error("You do not own this facility");

  batches = Math.max(1, Math.min(Number(batches) || 1, 10));

  // running jobs counter
  const running = await prisma.productionJob.count({
    where: { facilityId, status: { in: ["RUNNING"] } },
  });
  if (running + batches > facility.capacity) throw new Error("Facility capacity reached");

  const target = batches;

  await prisma.$transaction(async (tx) => {
    // consume inputs for all batches up front
    for (let b = 0; b < target; b++) {
      for (const cost of def.recipe) {
        await inventory.removeItem(playerId, cost.item, cost.qty, { tx });
      }
    }
    await tx.productionJob.create({
      data: { facilityId, playerId, recipeKey, target, produced: 0 },
    });
  });
  return { jobStarted: true, recipeKey, batches: target };
}

// Check progress of a job; finalize and reward output when elapsed >= timeMs.
// Zero downtime: progress derived from wall-clock per batch.
async function poll(playerId) {
  const jobs = await prisma.productionJob.findMany({
    where: { playerId, status: "RUNNING" },
    include: { facility: true },
  });
  const results = [];
  for (const job of jobs) {
    const def = ITEM[job.recipeKey];
    if (!def) continue;
    const batchRate = def.timeMs; // ms per batch
    const elapsed = Date.now() - new Date(job.startedAt).getTime();
    const fullyMade = Math.floor(elapsed / batchRate);
    const produce = Math.min(fullyMade, job.target - job.produced);
    if (produce > 0) {
      const minOut = def.producesPerJob[0];
      const maxOut = def.producesPerJob[1];
      const outQty = minOut + Math.floor(Math.random() * (maxOut - minOut + 1));
      const totalOut = produce * outQty;
      await prisma.$transaction(async (tx) => {
        await tx.productionJob.update({
          where: { id: job.id },
          data: { produced: { increment: produce } },
        });
        await inventory.addItem(playerId, job.recipeKey, totalOut, { tx });
        await economy.recordTransfer(null, playerId, 0n, "PRODUCTION", `Produced ${totalOut} x ${job.recipeKey}`, { tx });
      });
      results.push({ jobId: job.id, recipeKey: job.recipeKey, produced: totalOut });
    }
    // when all batches done, mark DONE
    const updated = await prisma.productionJob.findUnique({ where: { id: job.id } });
    if (updated && updated.produced >= updated.target) {
      await prisma.productionJob.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date() } });
    }
  }
  return results;
}

async function myJobs(playerId) {
  return prisma.productionJob.findMany({
    where: { playerId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { facility: true },
  });
}

async function createFacility(ownerId, kind, name, x, y) {
  const valid = ["MILL", "FACTORY", "WORKSHOP", "FARM", "WAREHOUSE", "PROCESSING_PLANT"];
  if (!valid.includes(kind)) throw new Error("Unknown facility kind");
  const facility = await prisma.productionFacility.create({
    data: { ownerId, kind, name, x, y },
  });
  return facility;
}

module.exports = { start, poll, myJobs, createFacility, recipesForFacility, facilityFor };
