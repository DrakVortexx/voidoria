const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { execSync } = require("child_process");
const { securityMiddleware } = require("./middleware/security");
const { startup, seedCatalogAndShop } = require("../prisma/startup");
const { WorldEngine } = require("./world/worldEngine");
const { setupSockets } = require("./sockets/gameSockets");

const app = express();
const PORT = process.env.PORT || 3000;

const WORLD_SEED = Number(process.env.WORLD_SEED) || 20260831;
const world = new WorldEngine({ seed: WORLD_SEED });

securityMiddleware(app);

app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());

app.set("trust proxy", 1);

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/meta", (req, res) => {
  res.json({
    name: "Voidoria",
    version: "1.0.0",
    seed: WORLD_SEED,
    worldBorder: 5000,
    dimensions: ["overworld", "void"],
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/player", require("./routes/player"));
app.use("/api/economy", require("./routes/economy"));
app.use("/api/shop", require("./routes/shop"));
app.use("/api/auction", require("./routes/auction"));
app.use("/api/teleport", require("./routes/teleport"));
app.use("/api/stasis", require("./routes/stasis"));
app.use("/api/world", require("./routes/world"));
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

async function main() {
  // Ensure the Prisma client is generated against the current schema (self-healing).
  // This guards against a stale client when only `npm install` runs (e.g. Render).
  try {
    execSync("npx prisma generate", { stdio: "ignore" });
  } catch (err) {
    console.error("Prisma generate failed (continuing):", err.message);
  }

  const autoPush = process.env.AUTO_PUSH_SCHEMA !== "false";

  // On first deploy with AUTO_PUSH_SCHEMA=true, sync the schema so tables exist
  // and the startup seed can populate shop categories, listings, and admin.
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

  const server = http.createServer(app);
  const { io, gs } = setupSockets(server, world);
  global.__gameServer = gs;
  app.locals.world = world;
  app.locals.gameServer = gs;

  // convenience export for teleport route usage checks
  io.on("connection", () => {});

  server.listen(PORT, () => {
    console.log(`Voidoria server running on port ${PORT}`);
  });

  // graceful shutdown: persist dirty chunks
  process.on("SIGINT", async () => {
    console.log("Saving world...");
    await world.saveAll().catch((e) => console.error(e));
    process.exit(0);
  });
}

main();
