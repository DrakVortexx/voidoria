function validateBody(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter((field) => {
      const val = req.body[field];
      return val === undefined || val === null || val === "";
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].trim();
      }
    }

    next();
  };
}

function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return str;
  return str.trim().slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 128;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function isPosInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

function isNonNegInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

module.exports = { validateBody, sanitizeString, isValidEmail, isValidUsername, isValidPassword, toInt, isPosInt, isNonNegInt };
