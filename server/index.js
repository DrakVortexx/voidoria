const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { execSync } = require("child_process");
const { securityMiddleware } = require("./middleware/security");
const { startup } = require("../prisma/startup");

const app = express();
const PORT = process.env.PORT || 3000;

securityMiddleware(app);

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/player", require("./routes/player"));
app.use("/api/shop", require("./routes/shop"));
app.use("/api/inventory", require("./routes/inventory"));
app.use("/api/trade", require("./routes/trade"));
app.use("/api/auction", require("./routes/auction"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/admin", require("./routes/admin"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const autoPush = process.env.AUTO_PUSH_SCHEMA !== "false";

  if (!isProduction && autoPush) {
    try {
      console.log("Syncing database schema...");
      execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
      console.log("Schema synced.");
    } catch (err) {
      console.error("Schema sync failed:", err.message);
    }
  }

  await startup();

  app.listen(PORT, () => {
    console.log(`Vaultoria server running on port ${PORT}`);
  });
}

main();