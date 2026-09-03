const { Server } = require("socket.io");
const prisma = require("../db");
const { COOKIE_NAME } = require("../config");

// Authoritative multiplayer presence layer.
// - Auth via httpOnly session cookie (parsed from handshake).
// - Players broadcast their authoritative position (persisted via /api/world/move).
// - Chat relay inside region is just a convenience broadcast; economy-affecting
//   actions always go through REST so the server stays authoritative.
function setupSockets(server) {
  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  const presence = new Map(); // socketId -> { profileId, name, x, y, region }

  async function profileFromHandshake(handshake) {
    try {
      const cookieStr = handshake.headers.cookie || (handshake.auth && handshake.auth.token) || "";
      const match = cookieStr.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
      if (!match) return null;
      const token = decodeURIComponent(match[1]);
      const session = await prisma.session.findFirst({
        where: { token, expiresAt: { gt: new Date() } },
        include: { user: { include: { profile: true } } },
      });
      if (!session) return null;
      return session.user.profile;
    } catch (e) {
      return null;
    }
  }

  io.on("connection", async (socket) => {
    const profile = await profileFromHandshake(socket.handshake);
    if (!profile) {
      socket.emit("auth:error", { error: "Not authenticated" });
      return;
    }

    presence.set(socket.id, {
      profileId: profile.id,
      name: profile.displayName,
      x: profile.posX, y: profile.posY,
      region: "Unknown",
    });

    socket.join("world");
    socket.emit("world:init", {
      you: {
        profileId: profile.id, name: profile.displayName,
        x: profile.posX, y: profile.posY,
      },
      players: Array.from(presence.values()).filter((p) => p.profileId !== profile.id),
    });

    socket.on("player:move", async (data) => {
      const entry = presence.get(socket.id);
      if (!entry) return;
      // positions are validated authoritative via REST; we just relay for
      // temporary live visibility. Values clamped here for safety.
      const x = Math.max(-450, Math.min(450, Number(data.x)));
      const y = Math.max(-450, Math.min(450, Number(data.y)));
      entry.x = x; entry.y = y;
      socket.to("world").emit("world:player-move", {
        profileId: entry.profileId, name: entry.name, x, y,
      });
    });

    socket.on("chat:message", (data) => {
      const entry = presence.get(socket.id);
      if (!entry) return;
      const text = String(data.text || "").slice(0, 240);
      if (!text.trim()) return;
      io.to("world").emit("chat:message", {
        from: entry.name, profileId: entry.profileId, text,
        at: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      const entry = presence.get(socket.id);
      presence.delete(socket.id);
      if (entry) {
        io.to("world").emit("world:player-leave", { profileId: entry.profileId });
      }
    });
  });

  return { io };
}

module.exports = { setupSockets };
