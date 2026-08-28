module.exports = {
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  COOKIE_NAME: "session_token",
  SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
};