module.exports = {
  GAME_NAME: "Voidoria",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  COOKIE_NAME: "session_token",
  SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
  STARTING_BALANCE: 5000,
  WORLD_SEED: Number(process.env.WORLD_SEED) || 20260831,
};
