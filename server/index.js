const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { execSync } = require("child_process");
const { securityMiddleware } = require("./middleware/security");
const { startup } = require("../prisma/startup");
const { setupSockets } = require("./sockets/gameSockets");

const app = express();
const PORT = process.env.PORT || 3000;
const WORLD_SEED = Number(process.env.WORLD_SEED) || 20260831;

securityMiddleware(app);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/index.html") {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/meta", (req, res) => {
  const { WORLD_BOUNDS } = require("./game/regions");
  res.json({
    name: "Voidoria",
    version: "1.1.0",
    seed: WORLD_SEED,
    world: WORLD_BOUNDS,
  });
});

// ---- Game routes (all mounted under /api) ----
app.use("/api/auth", require("./routes/auth"));
app.use("/api/world", require("./routes/world"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/economy", require("./routes/economy"));
app.use("/api/market", require("./routes/market"));
app.use("/api/shop", require("./routes/shop"));
app.use("/api/auction", require("./routes/auction"));
app.use("/api/business", require("./routes/business"));
app.use("/api/production", require("./routes/production"));
app.use("/api/building", require("./routes/building"));
app.use("/api/transport", require("./routes/transport"));
app.use("/api/pvp", require("./routes/pvp"));
app.use("/api/social", require("./routes/social"));
app.use("/api/leaderboards", require("./routes/leaderboards"));
app.use("/api/crates", require("./routes/crates"));
app.use("/api/admin", require("./routes/admin"));

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload too large" });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function startupBackground() {
  try {
    execSync("npx prisma generate", { stdio: "ignore" });
  } catch (err) {
    console.error("Prisma generate failed (continuing):", err.message);
  }

  const autoPush = process.env.AUTO_PUSH_SCHEMA !== "false";
  if (autoPush) {
    try {
      console.log("Syncing database schema...");
      execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
      console.log("Schema synced.");
    } catch (err) {
      console.error("Schema sync failed:", err.message);
    }
  }

  await startup();
  app.locals.ready = true;
}

function main() {
  const server = http.createServer(app);
  const { io } = setupSockets(server);
  app.locals.world = { seed: WORLD_SEED };
  app.locals.gameServer = { io };

  server.listen(PORT, () => {
    console.log(`Voidoria server listening on port ${PORT}`);
  });

  startupBackground().catch((err) => {
    console.error("Startup/sync failed:", err);
    process.exitCode = 1;
  });

  process.on("SIGINT", () => {
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    process.exit(0);
  });
}

main();
