const prisma = require("../db");
const { COOKIE_NAME } = require("../config");

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { player: true } } },
    });

    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: "Session expired" });
    }

    req.user = session.user;
    req.player = session.user.player;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).json({ error: "Authentication error" });
  }
}

module.exports = { requireAuth };
