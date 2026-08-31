const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sanitizeString } = require("../middleware/validate");
const tp = require("../services/teleport");
const { OVERWORLD } = require("../world/terrain");

const router = express.Router();
router.use(requireAuth);

function ctx(req) {
  const { world, gameServer } = req.app.locals;
  return { world, gameServer };
}

router.post("/spawn", async (req, res) => {
  try {
    const { gameServer } = ctx(req);
    const spawn = tp.spawnLocation();
    await enforceCooldown(req, "spawn");
    if (gameServer) gameServer.teleportPlayer(req.user.id, spawn);
    res.json({ position: spawn, message: "Teleported to spawn" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/rtp", async (req, res) => {
  try {
    const { world, gameServer } = ctx(req);
    await enforceCooldown(req, "rtp");
    const pos = await tp.findRtp(world);
    if (gameServer) gameServer.teleportPlayer(req.user.id, pos);
    res.json({ position: pos, message: "Random teleport" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/home", async (req, res) => {
  try {
    const name = sanitizeString(String(req.body.name || "home"), 20) || "home";
    const { gameServer } = ctx(req);
    const home = await prisma.playerHome.findFirst({ where: { playerId: req.player.id, name } });
    if (!home) return res.status(404).json({ error: `Home '${name}' not set` });
    await enforceCooldown(req, "home");
    const pos = { x: home.x, y: home.y + 0.5, z: home.z, dimension: home.dimension };
    if (gameServer) gameServer.teleportPlayer(req.user.id, pos);
    res.json({ position: pos, message: `Teleported to home '${name}'` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/tpa", async (req, res) => {
  try {
    const targetName = sanitizeString(String(req.body.username || ""), 20);
    const gameServer = ctx(req).gameServer;
    const target = await prisma.user.findUnique({ where: { username: targetName }, include: { profile: true, settings: true } });
    if (!target || !target.profile) return res.status(404).json({ error: "Player not found" });
    if (target.settings && target.settings.allowTpa === false) {
      return res.status(403).json({ error: `${targetName} has TPA disabled` });
    }
    const prev = await prisma.pendingTeleport.findFirst({
      where: { senderId: req.player.id, receiverId: target.profile.id, status: "PENDING" },
    });
    if (prev) return res.status(409).json({ error: "A request is already pending" });

    const reqRow = await prisma.pendingTeleport.create({
      data: { senderId: req.player.id, receiverId: target.profile.id, kind: "tpa", expiresAt: new Date(Date.now() + 30000) },
    });

    if (target.settings && target.settings.autoAcceptTpa && (gameServer?.players?.has(target.id))) {
      const accept = await finalizeTpa(gameServer, req.player.id, target.profile.id, false);
      return res.json(accept);
    }

    // notify online target via socket
    gameServer?.players?.get(target.id)?.socket?.emit("tp:request", {
      id: reqRow.id, kind: "tpa", from: req.player.displayName,
    });
    res.json({ message: `Teleport request sent to ${targetName}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/tpahere", async (req, res) => {
  try {
    const targetName = sanitizeString(String(req.body.username || ""), 20);
    const gameServer = ctx(req).gameServer;
    const target = await prisma.user.findUnique({ where: { username: targetName }, include: { profile: true, settings: true } });
    if (!target || !target.profile) return res.status(404).json({ error: "Player not found" });
    if (target.settings && target.settings.allowTpaHere === false) {
      return res.status(403).json({ error: `${targetName} has TPAHere disabled` });
    }
    const reqRow = await prisma.pendingTeleport.create({
      data: { senderId: req.player.id, receiverId: target.profile.id, kind: "tpahere", expiresAt: new Date(Date.now() + 30000) },
    });
    if (target.settings && target.settings.autoAcceptTpaHere && gameServer?.players?.has(target.id)) {
      const accept = await finalizeTpa(gameServer, req.player.id, target.profile.id, true);
      return res.json(accept);
    }
    gameServer?.players?.get(target.id)?.socket?.emit("tp:request", {
      id: reqRow.id, kind: "tpahere", from: req.player.displayName,
    });
    res.json({ message: `TpaHere request sent to ${targetName}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function finalizeTpa(gameServer, senderProfileId, receiverProfileId, isHere) {
  const sender = await prisma.playerProfile.findUnique({ where: { id: senderProfileId }, include: { user: true } });
  const receiver = await prisma.playerProfile.findUnique({ where: { id: receiverProfileId }, include: { user: true } });
  if (!sender || !receiver) return { error: "Player not found" };

  const reqRow = await prisma.pendingTeleport.findFirst({
    where: { senderId: sender.id, receiverId: receiver.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!reqRow) return { error: "No pending request" };
  await prisma.pendingTeleport.update({ where: { id: reqRow.id }, data: { status: "ACCEPTED" } });

  if (!gameServer) return { message: "Game server not active" };
  const receiverPos = gameServer.players?.get(receiver.user.id);
  const senderPos = gameServer.players?.get(sender.user.id);
  const dest = isHere
    ? (senderPos ? { x: senderPos.x, y: senderPos.y + 0.5, z: senderPos.z, dimension: senderPos.dimension } : null)
    : (receiverPos ? { x: receiverPos.x, y: receiverPos.y + 0.5, z: receiverPos.z, dimension: receiverPos.dimension } : null);
  if (!dest) return { message: "Request accepted, but player is offline" };

  const movedId = isHere ? receiver.user.id : sender.user.id;
  gameServer.teleportPlayer(movedId, dest);
  return { message: "Teleport accepted", position: dest };
}

router.post("/tpaccept", async (req, res) => {
  const requestId = String(req.body.requestId || "");
  const row = await prisma.pendingTeleport.findFirst({
    where: { id: requestId, receiverId: req.player.id, status: "PENDING" },
  });
  if (!row) return res.status(404).json({ error: "Request not found or expired" });
  const result = await finalizeTpa(ctx(req).gameServer, row.senderId, row.receiverId, row.kind === "tpahere");
  res.json(result);
});

router.post("/tpdeny", async (req, res) => {
  const requestId = String(req.body.requestId || "");
  await prisma.pendingTeleport.updateMany({
    where: { id: requestId, receiverId: req.player.id, status: "PENDING" },
    data: { status: "DECLINED" },
  });
  res.json({ message: "Request declined" });
});

async function enforceCooldown(req, kind) {
  const remaining = await tp.getCooldown(req.user.id, kind);
  if (remaining > 0) {
    const err = new Error(`Please wait ${Math.ceil(remaining / 1000)}s`);
    err.status = 429;
    throw err;
  }
  await tp.setCooldown(req.user.id, kind, tp.TP_COOLDOWN_MS[kind] || 5000);
}

function errStatus(err) {
  return err.status || 400;
}

module.exports = router;
