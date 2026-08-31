const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sanitizeString, toInt, isPosInt, isNonNegInt } = require("../middleware/validate");
const { getBalanceNumber, baltop } = require("../services/economy");
const inventorySvc = require("../services/inventory");
const { OVERWORLD, WORLD_BORDER, WORLD_HEIGHT } = require("../world/terrain");

const router = express.Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  const profile = req.player;
  const user = req.user;
  if (!profile) {
    return res.status(200).json({ needsCustomization: true });
  }
  const coins = await getBalanceNumber(profile.id);
  res.json({
    user: { id: user.id, username: user.username },
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      appearance: profile.appearance,
      pos: { x: profile.posX, y: profile.posY, z: profile.posZ },
      dimension: profile.dimension,
      health: profile.health,
      hunger: profile.hunger,
      xp: profile.xp,
      level: profile.level,
      kills: profile.kills,
      deaths: profile.deaths,
      coins,
    },
    settings: req.settings,
  });
});

// Character customization
router.put("/appearance", async (req, res) => {
  try {
    if (!req.player) return res.status(404).json({ error: "No profile" });
    const a = req.body.appearance;
    if (!a || typeof a !== "object") {
      return res.status(400).json({ error: "appearance object required" });
    }
    const allowed = ["skinTone","hairStyle","hairColor","face","shirtColor","pantsColor","shoesColor","accessory"];
    const clean = {};
    for (const k of allowed) if (a[k] !== undefined) clean[k] = sanitizeString(String(a[k]), 40);
    const merged = { ...(req.player.appearance || {}), ...clean };
    await prisma.playerProfile.update({ where: { id: req.player.id }, data: { appearance: merged } });
    res.json({ appearance: merged });
  } catch (err) {
    res.status(500).json({ error: "Failed to save appearance" });
  }
});

router.put("/display-name", async (req, res) => {
  try {
    const name = sanitizeString(String(req.body.displayName || ""), 20);
    if (!name) return res.status(400).json({ error: "Display name required" });
    await prisma.playerProfile.update({ where: { id: req.player.id }, data: { displayName: name } });
    res.json({ displayName: name });
    req.ioNotifier?.refresh?.();
  } catch (err) {
    res.status(500).json({ error: "Failed to update display name" });
  }
});

router.get("/stats", async (req, res) => {
  const p = req.player;
  if (!p) return res.status(404).json({ error: "No profile" });
  const coins = await getBalanceNumber(p.id);
  res.json({
    displayName: p.displayName,
    level: p.level, xp: p.xp, nextXp: p.level * 100,
    health: p.health, hunger: p.hunger,
    kills: p.kills, deaths: p.deaths,
    coins,
    dimension: p.dimension,
    pos: { x: p.posX, y: p.posY, z: p.posZ },
  });
});

router.get("/leaderboard", async (req, res) => {
  const byCoins = await baltop(10);
  const byLevel = await prisma.playerProfile.findMany({
    orderBy: [{ level: "desc" }, { xp: "desc" }],
    take: 10,
    select: { displayName: true, level: true, xp: true },
  });
  res.json({ byCoins, byLevel });
});

// ---------- Inventory ----------
router.get("/inventory", async (req, res) => {
  const inv = await inventorySvc.getInventory(req.player.id);
  res.json({ inventory: inv.map((s) => ({ slot: s.slot, itemType: s.itemType, amount: s.amount, durability: s.durability, metadata: s.metadata })) });
});

// ---------- Settings ----------
router.get("/settings", async (req, res) => {
  res.json(req.settings);
});

router.put("/settings", async (req, res) => {
  const allowed = ["allowTpa","allowTpaHere","autoAcceptTpa","autoAcceptTpaHere","chatVisible","chatNotifications","allowPvp","showScoreboard","notifications"];
  const data = {};
  let changed = false;
  for (const k of allowed) {
    if (typeof req.body[k] === "boolean") { data[k] = req.body[k]; changed = true; }
  }
  if (!changed) return res.status(400).json({ error: "No valid settings provided" });
  const s = await prisma.playerSetting.upsert({
    where: { userId: req.user.id },
    update: data,
    create: { userId: req.user.id, ...data },
  });
  res.json(s);
});

// ---------- Homes ----------
router.get("/homes", async (req, res) => {
  const homes = await prisma.playerHome.findMany({ where: { playerId: req.player.id } });
  res.json({ homes });
});

router.post("/sethome", async (req, res) => {
  try {
    const name = sanitizeString(String(req.body.name || "home"), 20) || "home";
    const x = Number(req.body.x), y = Number(req.body.y), z = Number(req.body.z);
    const dimension = String(req.body.dimension || OVERWORLD).slice(0, 40);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return res.status(400).json({ error: "Valid coordinates required" });
    }
    const count = await prisma.playerHome.count({ where: { playerId: req.player.id } });
    if (count >= 5) return res.status(400).json({ error: "You have reached the home limit (5)" });
    await prisma.playerHome.upsert({
      where: { playerId_name: { playerId: req.player.id, name } },
      update: { x, y, z, dimension },
      create: { playerId: req.player.id, name, x, y, z, dimension },
    });
    res.json({ message: `Home '${name}' set` });
  } catch (err) {
    res.status(500).json({ error: "Failed to set home" });
  }
});

router.post("/delhome", async (req, res) => {
  const name = sanitizeString(String(req.body.name || "home"), 20) || "home";
  await prisma.playerHome.deleteMany({ where: { playerId: req.player.id, name } });
  res.json({ message: `Home '${name}' removed` });
});

// ---------- Bounties ----------
router.get("/bounties", async (req, res) => {
  const bounties = await prisma.bounty.findMany({
    where: { status: "ACTIVE" },
    include: {
      target: { select: { displayName: true } },
      creator: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({
    bounties: bounties.map((b) => ({
      id: b.id, target: b.target.displayName, creator: b.creator.displayName,
      amount: Number(b.amount), createdAt: b.createdAt, expiresAt: b.expiresAt,
    })),
  });
});

router.post("/bounties", async (req, res) => {
  try {
    const targetName = sanitizeString(String(req.body.target || ""), 20);
    const amount = toInt(req.body.amount);
    if (!isPosInt(amount)) return res.status(400).json({ error: "Valid amount required" });

    const targetUser = await prisma.user.findUnique({ where: { username: targetName }, include: { profile: true } });
    if (!targetUser || !targetUser.profile) return res.status(404).json({ error: "Player not found" });
    if (targetUser.id === req.user.id) return res.status(400).json({ error: "Cannot place a bounty on yourself" });

    const economy = require("../services/economy");
    const bal = await economy.getBalance(req.player.id);
    if (bal < BigInt(amount)) return res.status(400).json({ error: "Insufficient funds" });

    await economy.paySystem(req.player.id, amount, "bounty", `Bounty on ${targetName}`);

    await prisma.bounty.create({
      data: {
        creatorId: req.player.id,
        targetId: targetUser.profile.id,
        amount: BigInt(amount),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    res.json({ message: `Bounty of $${amount} placed on ${targetName}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to place bounty" });
  }
});

// ---------- Friends ----------
router.get("/friends", async (req, res) => {
  const sent = await prisma.friendship.findMany({
    where: { userAId: req.user.id },
    include: { userB: { select: { username: true } } },
  });
  const received = await prisma.friendship.findMany({
    where: { userBId: req.user.id },
    include: { userA: { select: { username: true } } },
  });
  res.json({
    friends: [
      ...sent.filter(f=>f.status==="ACCEPTED").map(f=>({ username: f.userB.username, status: f.status })),
      ...received.filter(f=>f.status==="ACCEPTED").map(f=>({ username: f.userA.username, status: f.status })),
    ],
    outgoing: sent.filter(f=>f.status==="PENDING").map(f=>f.userB.username),
    incoming: received.filter(f=>f.status==="PENDING").map(f=>({ id: f.id, username: f.userA.username })),
  });
});

router.post("/friends/request", async (req, res) => {
  const name = sanitizeString(String(req.body.username || ""), 20);
  const target = await prisma.user.findUnique({ where: { username: name } });
  if (!target) return res.status(404).json({ error: "Player not found" });
  if (target.id === req.user.id) return res.status(400).json({ error: "Cannot add yourself" });
  const [a, b] = target.id < req.user.id ? [target.id, req.user.id] : [req.user.id, target.id];
  const existing = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  if (existing) return res.status(409).json({ error: "Friend request already exists" });
  await prisma.friendship.create({ data: { userAId: req.user.id, userBId: target.id, status: "PENDING" } });
  res.json({ message: `Friend request sent to ${name}` });
});

router.post("/friends/respond", async (req, res) => {
  const id = String(req.body.id || "");
  const accept = req.body.accept === true;
  const f = await prisma.friendship.findFirst({ where: { id, userBId: req.user.id, status: "PENDING" } });
  if (!f) return res.status(404).json({ error: "Request not found" });
  await prisma.friendship.update({ where: { id: f.id }, data: { status: accept ? "ACCEPTED" : "CANCELLED" } });
  res.json({ message: accept ? "Friend added" : "Request declined" });
});

// ---------- Misc player placement endpoint used by chore services ----------
router.post("/void/portal", async (req, res) => {
  const portal = {
    x: Number(req.body.x), y: Number(req.body.y), z: Number(req.body.z),
  };
  if (!Number.isFinite(portal.x) || !Number.isFinite(portal.y) || !Number.isFinite(portal.z)) {
    return res.status(400).json({ error: "Invalid portal coordinates" });
  }
  res.json({ message: "Void portal active", portal, dimension: "void" });
});

module.exports = router;
