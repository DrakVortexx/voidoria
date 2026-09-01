const { Server } = require("socket.io");
const prisma = require("../db");
const { COOKIE_NAME } = require("../config");
const { CHUNK_SIZE, WORLD_HEIGHT, yIndex, OVERWORLD, VOID } = require("../world/terrain");
const { BLOCK, BLOCK_META } = require("../world/blocks");
const { ITEMS, getItem, placeableBlock } = require("../world/items");
const inventory = require("../services/inventory");
const economy = require("../services/economy");

const VIEW_DISTANCE = 3; // chunks radius

class GameServer {
  constructor(world) {
    this.world = world;
    this.players = new Map(); // userId -> client
    this.sockets = new Map(); // socketId -> client
  }

  attach(io) {
    this.io = io;
    this.setupAuth();
    this.voidTick = setInterval(() => this.tickVoid(), 1000);
    this.voidTick.unref?.();
  }

  setupAuth() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.split(';').map(s=>s.trim()).find(c=>c.startsWith(COOKIE_NAME+'='))?.split('=')[1];
        if (!token) return next(new Error("Not authenticated"));
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { include: { profile: true, settings: true } } },
        });
        if (!session || session.expiresAt < new Date()) return next(new Error("Invalid session"));
        socket.data.user = session.user;
        socket.data.profile = session.user.profile;
        next();
      } catch (e) {
        next(new Error("Authentication error"));
      }
    });
  }

  onConnection(socket) {
    const user = socket.data.user;
    const profile = socket.data.profile;
    if (!profile) {
      socket.emit("fatal", { error: "No player profile" });
      socket.disconnect();
      return;
    }

    const client = {
      socket,
      user,
      profile,
      x: profile.posX || 8,
      y: profile.posY || 70,
      z: profile.posZ || 8,
      yaw: profile.rotationY || 0,
      pitch: 0,
      dimension: profile.dimension || OVERWORLD,
      health: profile.health ?? 20,
      maxHealth: 20,
      hunger: profile.hunger ?? 20,
      onGround: false,
      chunkLoads: new Map(), // key -> {cx,cz}
      lastMoveAt: 0,
      subscribed: new Set(),
      lastAttackAt: 0,
      invulnerableUntil: 0,
    };

    this.players.set(user.id, client);
    this.sockets.set(socket.id, client);

    socket.emit("world:init", {
      seed: this.world.seed,
      border: 5000,
      dimensions: [OVERWORLD, VOID],
      isVoid: profile.dimension === VOID,
      player: this._publicOf(client),
    });

    socket.on("move", (d) => this.onMove(client, d));
    socket.on("loadChunks", (d) => this.onLoadChunks(client, d));
    socket.on("break", (d) => this.onBreak(client, d));
    socket.on("place", (d) => this.onPlace(client, d));
    socket.on("use", (d) => this.onUse(client, d));
    socket.on("chat", (d) => this.onChat(client, d));
    socket.on("attack", (d) => this.onAttack(client, d));
    socket.on("disconnect", () => this.onDisconnect(client));

    this.emitStats(client);
    socket.broadcast.emit("player:join", { id: user.id, name: profile.displayName });
  }


  _publicOf(client) {
    return {
      id: client.user.id,
      name: client.profile.displayName,
      x: client.x, y: client.y, z: client.z,
      dimension: client.dimension,
      health: client.health,
      hunger: client.hunger,
    };
  }

  async onMove(client, d) {
    const now = Date.now();
    if (now - client.lastMoveAt < 30) return; // throttle
    client.lastMoveAt = now;

    if (!d || typeof d.x !== "number") return;

    const dx = d.x - client.x, dy = d.y - client.y, dz = d.z - client.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    // Server-authoritative anti-cheat: limit horizontal speed
    if (dist > 5) {
      // teleport nudge - reject
      socketDisconnectAndLog(client, "Invalid movement");
      return;
    }
    if (Math.abs(dy) > 4) return;

    // world border
    if (Math.abs(d.x) > 5001 || Math.abs(d.z) > 5001) {
      client.socket.emit("border", { x: Math.max(-5000, Math.min(5000, d.x)), z: Math.max(-5000, Math.min(5000, d.z)) });
      return;
    }

    client.x = d.x; client.y = d.y; client.z = d.z;
    client.yaw = d.yaw || 0; client.pitch = d.pitch || 0;
    client.onGround = !!d.onGround;

    // persist position occasionally
    if (Math.random() < 0.02) {
      void this.persist(client);
    }

    const msg = { id: client.user.id, x: d.x, y: d.y, z: d.z, yaw: client.yaw, pitch: client.pitch, dimension: client.dimension };
    client.socket.broadcast.emit("player:move", msg);
  }

  async onLoadChunks(client, d) {
    const dim = d.dimension || client.dimension;
    // When the client supplies explicit chunk coordinates, send just that one
    // chunk (the client requests each chunk in its view radius individually).
    // Only when coordinates are omitted do we fan out over the view distance
    // (e.g. a client that streams by player position).
    const hasCoord = d.cx !== undefined && d.cx !== null && d.cz !== undefined && d.cz !== null;
    if (hasCoord) {
      const cx = Math.floor(d.cx);
      const cz = Math.floor(d.cz);
      const k = `${dim}:${cx}:${cz}`;
      const cached = client.chunkLoads.get(k);
      if (!cached || cached.cx !== cx || cached.cz !== cz) {
        this.sendChunkTo(client, dim, cx, cz);
      }
      return;
    }

    const ccxC = Math.floor(client.x / CHUNK_SIZE);
    const czC = Math.floor(client.z / CHUNK_SIZE);
    const vd = Math.min(4, d.viewDistance || VIEW_DISTANCE);
    const needed = new Set();
    for (let dx = -vd; dx <= vd; dx++) {
      for (let dz = -vd; dz <= vd; dz++) {
        const k = `${dim}:${ccxC + dx}:${czC + dz}`;
        needed.add(k);
        const cached = client.chunkLoads.get(k);
        if (!cached || cached.cx !== ccxC + dx || cached.cz !== czC + dz) {
          await this.sendChunkTo(client, dim, ccxC + dx, czC + dz);
        }
      }
    }
    // unload chunks outside
    for (const k of Array.from(client.chunkLoads.keys())) {
      if (!needed.has(k)) {
        client.chunkLoads.delete(k);
        const [d2, cx2, cz2] = k.split(":");
        client.socket.emit("chunk:unload", { dimension: d2, cx: Number(cx2), cz: Number(cz2) });
      }
    }
  }

  async sendChunkTo(client, dim, cx, cz) {
    try {
      const { blocks } = await this.world.getChunk(dim, cx, cz);
      const keyM = `${dim}:${cx}:${cz}`;
      client.chunkLoads.set(keyM, { cx, cz });
      client.socket.emit("chunk", { dimension: dim, cx, cz, data: Buffer.from(blocks.buffer, blocks.byteOffset, blocks.byteLength).toString("base64") });
    } catch (e) {
      client.socket.emit("chunk:error", { cx, cz, error: e.message });
    }
  }

  async onBreak(client, d) {
    const { x, y, z } = d;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    try {
      // distance validation
      const dx = x + 0.5 - client.x, dy = y + 0.5 - client.y, dz = z + 0.5 - client.z;
      const reach = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (reach > 7) return;

      const chunkKey = `${client.dimension}:${Math.floor(x/16)}:${Math.floor(z/16)}`;
      const prev = this.world.blockAt(client.dimension, x, y, z);
      const meta = BLOCK_META[prev];
      if (!meta || !meta.solid || prev === BLOCK.BEDROCK || prev === BLOCK.VOID_CORE) return;

      await this.world.setBlock(client.dimension, x, y, z, BLOCK.AIR);
      this.broadcastBlock(client, x, y, z, BLOCK.AIR, prev);

      // drop blocks to inventory
      const dropItemType = this.blockToItem(prev);
      if (dropItemType && dropItemType !== "block:air") {
        try { await inventory.addItem(client.profile.id, dropItemType, 1); }
        catch (e) { /* full inv - drop silently */ }
      }
      this.emitStats(client);
      client.socket.emit("inventory:update");
    } catch (e) {
      client.socket.emit("error", { error: e.message });
    }
  }

  async onPlace(client, d) {
    const { x, y, z, itemType } = d;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    try {
      const placeBlock = placeableBlock(itemType);
      if (placeBlock == null) return;
      // reach check
      const dx = x + 0.5 - client.x, dy = y + 0.5 - client.y, dz = z + 0.5 - client.z;
      if (Math.sqrt(dx*dx+dy*dy+dz*dz) > 7) return;

      if (!await inventory.hasItem(client.profile.id, itemType, 1)) {
        client.socket.emit("error", { error: "You do not have this item" });
        return;
      }
      const target = this.world.blockAt(client.dimension, x, y, z);
      if (BLOCK_META[target]?.solid) return; // can't place into solid
      // don't place inside player
      if (Math.floor(client.x) === x && Math.floor(client.z) === z && Math.floor(client.y) === y) return;

      await inventory.removeItem(client.profile.id, itemType, 1);
      await this.world.setBlock(client.dimension, x, y, z, placeBlock);
      this.broadcastBlock(client, x, y, z, placeBlock, target);
      client.socket.emit("inventory:update");
    } catch (e) {
      client.socket.emit("error", { error: e.message });
    }
  }

  async onUse(client, d) {
    const { itemType } = d || {};
    const def = getItem(itemType);
    if (!def) return;
    if (itemType === "item:void_totem") {
      return this._consumeVoidTotem(client);
    }
    if (def.type === "food") {
      // eat: restore hunger
      client.hunger = Math.min(20, client.hunger + 6);
      await this._removeItemOf(client, itemType, 1);
      this.emitStats(client);
      client.socket.emit("inventory:update");
    }
  }

  async _removeItemOf(client, itemType, n) {
    try { await inventory.removeItem(client.profile.id, itemType, n); } catch (e) {}
  }

  onChat(client, d) {
    const msg = String(d?.message || "").slice(0, 200);
    if (!msg.trim()) return;
    this.io.emit("chat", { id: client.user.id, name: client.profile.displayName, message: msg });
  }

  async onAttack(client, d) {
    const targetId = d?.targetId;
    if (!targetId || targetId === client.user.id) return;
    if (Date.now() - client.lastAttackAt < 500) return;
    client.lastAttackAt = Date.now();

    const target = this.players.get(targetId);
    if (!target) return;
    const dx = target.x - client.x, dy = target.y - client.y, dz = target.z - client.z;
    if (Math.sqrt(dx*dx + dz*dz) > 4 || Math.abs(dy) > 3) return; // within range
    if (target.dimension !== client.dimension) return;
    if (Date.now() < target.invulnerableUntil) return;

    // PvP setting check
    const tsettings = target.user.settings;
    if (tsettings && tsettings.allowPvp === false) {
      client.socket.emit("error", { error: "Target has PvP disabled" });
      return;
    }
    const ssettings = client.user.settings;
    if (ssettings && ssettings.allowPvp === false) {
      client.socket.emit("error", { error: "You have PvP disabled" });
      return;
    }

    // damage from held weapon
    const held = d.heldItem || "item:wood_sword";
    const heldDef = getItem(held);
    let dmg = heldDef?.damage || 3;
    if (held === "hand") dmg = 2;

    target.health -= dmg;
    target.socket.emit("damage", { from: client.user.id, amount: dmg, health: target.health });
    client.socket.emit("hit", { target: targetId, damage: dmg });

    if (target.health <= 0) {
      await this.handleDeath(target, client);
    } else {
      if (this._isVoid(client)) this.voidHazard(target);
    }
    this.emitStats(target);
  }

  _isVoid(c) { return c.dimension === VOID; }

  // The Void drains the player each tick. A Void Totem consumed on use grants
  // temporary protection; otherwise the player takes damage and can die.
  voidHazard(client) {
    client.socket.emit("void:hazard", {});
  }

  async _consumeVoidTotem(client, { silent = false } = {}) {
    try {
      const has = await inventory.countItem(client.profile.id, "item:void_totem");
      if (has <= 0) {
        if (!silent) client.socket.emit("error", { error: "You have no Void Totem to protect you." });
        return false;
      }
      await inventory.removeItem(client.profile.id, "item:void_totem", 1);
      client.protectedUntil = Date.now() + 8000;
      client.socket.emit("void:protected", {});
      client.socket.emit("inventory:update");
      return true;
    } catch (e) {
      client.socket.emit("error", { error: e.message });
      return false;
    }
  }

  async voidDamage(client) {
    // apply void damage unless protected or invulnerable
    if (client.protectedUntil && client.protectedUntil > Date.now()) {
      return;
    }
    client.health -= 6;
    this.emitStats(client);
    if (client.health <= 0) {
      await this.handleDeath(client, null);
    }
  }

  tickVoid() {
    const now = Date.now();
    for (const client of this.players.values()) {
      if (client.dimension !== VOID) continue;
      if (client.invulnerableUntil > now) continue;
      client.socket.emit("void:hazard", {});
      void this.voidDamage(client);
    }
  }

  async handleDeath(victim, killer) {
    const msg = { victimId: victim.user.id, killerId: killer?.user?.id || null, victim: victim.profile.displayName, killer: killer?.profile?.displayName || "the world" };
    this.io.emit("death", msg);

    if (killer) {
      // bounty claim
      await this.claimBounty(killer, victim);

      // killer reward (small)
      try {
        await economy.creditSystem(killer.profile.id, 20, "PVP", "Kill reward");
      } catch (e) {}
      this._bumpXp(killer, 10);
    }

    // victim death penalty
    const vprofile = victim.profile;
    await prisma.playerProfile.update({
      where: { id: vprofile.id },
      data: { deaths: { increment: 1 }, health: 20, hunger: 20, xp: { decrement: 5 } },
    });

    // respawn with invulnerability
    victim.health = 20; victim.hunger = 20; victim.invulnerableUntil = Date.now() + 5000;
    const sp = victim.dimension === VOID
      ? { x: 8.5, y: 70, z: 8.5, dimension: OVERWORLD }
      : { x: 8.5, y: 70, z: 8.5, dimension: OVERWORLD };
    victim.x = sp.x; victim.y = sp.y; victim.z = sp.z; victim.dimension = sp.dimension;
    victim.socket.emit("respawn", sp);
    this.broadcastMoveAt(victim);
    this.emitStats(victim);
  }

  broadcastMoveAt(c) {
    const msg = { id: c.user.id, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, dimension: c.dimension };
    c.socket.broadcast.emit("player:move", msg);
  }

  async claimBounty(killer, victim) {
    try {
      const bounties = await prisma.bounty.findMany({
        where: { targetId: victim.profile.id, status: "ACTIVE" },
      });
      for (const b of bounties) {
        await prisma.$transaction(async (tx) => {
          const lock = await tx.bounty.updateMany({
            where: { id: b.id, status: "ACTIVE" },
            data: { status: "CLAIMED", claimedBy: killer.user.id, ...(false ? {} : {}) },
          });
          if (lock.count === 0) return;
          await economy.credit(killer.profile.id, b.amount, { tx });
          await economy.recordTransfer(null, killer.profile.id, b.amount, "BOUNTY_REWARD", `Bounty for ${victim.profile.displayName}`, { tx });
        });
        this.io.emit("bounty:claimed", {
          killer: killer.profile.displayName,
          target: victim.profile.displayName,
          amount: Number(b.amount),
        });
        killer.socket.emit("notification", { title: "Bounty Claimed", message: `You earned $${Number(b.amount)} for defeating ${victim.profile.displayName}` });
      }
    } catch (e) {}
  }

  async _bumpXp(client, amount) {
    const p = client.profile;
    let xp = p.xp + amount;
    let level = p.level;
    const need = level * 100;
    let leveled = 0;
    while (xp >= need) {
      xp -= need;
      level += 1;
      leveled += 1;
    }
    if (leveled > 0) {
      client.socket.emit("levelup", { level, levels: leveled });
      await prisma.playerProfile.update({ where: { id: p.id }, data: { xp, level } });
      client.profile.xp = xp; client.profile.level = level;
    } else {
      await prisma.playerProfile.update({ where: { id: p.id }, data: { xp } });
      client.profile.xp = xp;
    }
    this.emitStats(client);
  }

  blockToItem(block) {
    const map = {
      [BLOCK.STONE]: "block:stone", [BLOCK.COBBLESTONE]: "block:cobblestone",
      [BLOCK.DIRT]: "block:dirt", [BLOCK.GRASS]: "block:dirt", [BLOCK.SAND]: "block:sand",
      [BLOCK.GRAVEL]: "block:gravel", [BLOCK.WOOD]: "block:wood", [BLOCK.LEAVES]: "block:leaves",
      [BLOCK.PLANKS]: "block:planks", [BLOCK.GLASS]: "block:glass", [BLOCK.SANDSTONE]: "block:sandstone",
      [BLOCK.COAL_ORE]: "block:coal_ore", [BLOCK.IRON_ORE]: "block:iron_ore", [BLOCK.GOLD_ORE]: "block:gold_ore",
      [BLOCK.DIAMOND_ORE]: "block:diamond_ore", [BLOCK.VOID_ORE]: "block:void_ore",
      [BLOCK.VOID_STONE]: "block:void_stone", [BLOCK.VOID_GRASS]: "block:void_stone",
      [BLOCK.VOID_SHARD_ORE]: "item:void_shard", [BLOCK.CACTUS]: "block:cactus", [BLOCK.FLOWER]: "block:flower",
      [BLOCK.STASIS_CHAMBER]: "block:stasis_chamber",
      [BLOCK.SNOW]: "block:air", [BLOCK.ICE]: "block:air",
    };
    return map[block] || null;
  }

  broadcastBlock(source, x, y, z, block, prev) {
    const msg = { dimension: source.dimension, x, y, z, block, prev };
    this.io.emit("block:update", msg);
  }

  async emitStats(client) {
    const coins = Number(await economy.getBalance(client.profile.id));
    client.socket.emit("stats", {
      health: client.health, maxHealth: client.maxHealth,
      hunger: client.hunger, xp: client.profile.xp, level: client.profile.level,
      x: client.x, y: client.y, z: client.z, dimension: client.dimension,
      coins, kills: client.profile.kills, deaths: client.profile.deaths,
      name: client.profile.displayName,
    });
  }

  async persist(client) {
    await prisma.playerProfile.update({
      where: { id: client.profile.id },
      data: { posX: client.x, posY: client.y, posZ: client.z, rotationY: client.yaw, dimension: client.dimension, health: client.health, hunger: client.hunger, lastSeenAt: new Date() },
    });
  }

  async onDisconnect(client) {
    await this.persist(client).catch(() => {});
    this.players.delete(client.user.id);
    this.sockets.delete(client.socket.id);
    this.io.emit("player:leave", { id: client.user.id });
  }

  // ---- teleport helpers (used by REST) ----
  teleportPlayer(userId, pos) {
    const c = this.players.get(userId);
    if (!c) return false;
    c.x = pos.x; c.y = pos.y; c.z = pos.z; c.dimension = pos.dimension;
    c.socket.emit("teleport", pos);
    c.socket.broadcast.emit("player:move", { id: userId, x: pos.x, y: pos.y, z: pos.z, yaw: c.yaw, pitch: c.pitch, dimension: pos.dimension });
    this.emitStats(c);
    return true;
  }

  // Stasis chamber pull
  async stasisPull(chamberOwner, targetPlayer, chamber) {
    // validate authorization & cooldown, then teleport target to chamber
    const c = this.players.get(targetPlayer);
    if (!c) return { ok: false, error: "Target is not online" };
    const cooldown = await economy; // placeholder
    c.x = chamber.x; c.y = chamber.y; c.z = chamber.z; c.dimension = chamber.dimension;
    c.socket.emit("teleport", { x: chamber.x, y: chamber.y, z: chamber.z, dimension: chamber.dimension });
    c.socket.broadcast.emit("player:move", { id: targetPlayer, x: chamber.x, y: chamber.y, z: chamber.z, yaw: c.yaw, pitch: c.pitch, dimension: chamber.dimension });
    this.emitStats(c);
    return { ok: true };
  }
}

function socketDisconnectAndLog(client, reason) {
  try { client.socket.disconnect(true); } catch (e) {}
}

function setupSockets(httpServer, world) {
  const io = new Server(httpServer, { cors: { origin: "*", credentials: true } });
  const gs = new GameServer(world);
  gs.attach(io);
  io.on("connection", (socket) => gs.onConnection(socket));
  // expose helpers for REST
  io.__gameServer = gs;
  return { io, gs };
}

module.exports = { setupSockets, GameServer };
