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
  };
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

    const existing = await prisma.user.findFirst({
      where: { username },
    });
    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        player: {
          create: { coins: 10000, level: 1, xp: 0 },
        },
      },
      include: { player: true },
    });

    const token = uuidv4();
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_DURATION_MS,
      path: "/",
    });

    res.status(201).json({
      user: publicUser(user),
      player: user.player,
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
      include: { player: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = uuidv4();
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_DURATION_MS,
      path: "/",
    });

    res.json({
      user: publicUser(user),
      player: user.player,
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
    console.error("Logout error:", err);
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
      include: { user: { include: { player: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      return res.status(401).json({ error: "Not authenticated" });
    }

    res.json({
      user: publicUser(session.user),
      player: session.user.player,
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

module.exports = router;
