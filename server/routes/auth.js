const express = require("express");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const prisma = require("../db");
const { validateBody, isValidUsername, isValidPassword } = require("../middleware/validate");
const { ADMIN_USERNAME, COOKIE_NAME, SESSION_DURATION_MS } = require("../config");

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.username === ADMIN_USERNAME,
    hasProfile: !!user.profile,
  };
}

const STARTER_ITEMS = [
  ["stone_pickaxe", 1],
  ["axe", 1],
  ["wood", 20],
  ["stone", 20],
  ["berries", 10],
];

async function finalizeLogin(res, user) {
  const token = uuidv4();
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
  return token;
}

router.post("/register", validateBody(["username", "password", "confirmPassword"]), async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "Username must be 3-20 characters, alphanumeric and underscores only" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be 6-128 characters" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const existing = await prisma.user.findFirst({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        profile: {
          create: {
            displayName: username,
            appearance: defaultAppearance(),
            posX: 0, posY: 0,
          },
        },
        settings: { create: {} },
      },
      include: { profile: true, settings: true },
    });

    // starter funds, inventory, stats + spawn (server-authoritative)
    const { initializePlayer } = require("../services/profile");
    await initializePlayer(user.profile.id);

    await finalizeLogin(res, user);

    // After customization flag: new account -> send to character creation
    res.status(201).json({
      user: publicUser(user),
      isNew: true,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", validateBody(["login", "password"]), async (req, res) => {
  try {
    const { login, password } = req.body;

    const user = await prisma.user.findFirst({
      where: { username: login },
      include: { profile: true, settings: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await finalizeLogin(res, user);

    res.json({
      user: publicUser(user),
      isNew: false,
      player: user.profile || null,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { profile: true, settings: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: "Not authenticated" });
    }

    res.json({
      user: publicUser(session.user),
      player: session.user.profile,
      settings: session.user.settings,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Change password (while logged in)
router.post("/change-password", requireAuthLocal, validateBody(["currentPassword", "newPassword"]), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    if (!isValidPassword(req.body.newPassword)) {
      return res.status(400).json({ error: "New password must be 6-128 characters" });
    }
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    res.json({ message: "Password changed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

function defaultAppearance() {
  return {
    skinTone: "#e0ac69",
    hairStyle: "short",
    hairColor: "#3b2a1a",
    face: "default",
    shirtColor: "#2e7d9a",
    pantsColor: "#3f4c66",
    shoesColor: "#2b2b2b",
    accessory: "none",
  };
}

function requireAuthLocal(req, res, next) {
  const { requireAuth } = require("../middleware/auth");
  return requireAuth(req, res, next);
}

module.exports = router;
