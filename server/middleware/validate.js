/**
 * Request validation helpers for the Okasa API.
 * Mirrors the frontend sanitization but enforces server-side.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}\s'-]+$/u;

/**
 * Sanitize a string input — strip dangerous chars, enforce length.
 */
export function sanitize(str, maxLength = 100) {
  if (typeof str !== "string") return "";
  return str
    .normalize("NFC")
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    .replace(/[<>"'`\\{}()|;]/g, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Validate email format.
 */
export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email) && email.length <= 255;
}

/**
 * Validate a name (letters, spaces, hyphens, apostrophes — supports African diacritics).
 */
export function isValidName(name) {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 30 && NAME_RE.test(trimmed);
}

/**
 * Validate password strength — min 6 chars for demo (relaxed).
 */
export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 128;
}

/**
 * Validate language selection.
 */
const ALLOWED_LANGUAGES = new Set(["twi", "ga", "ewe", "fante", "dagbani"]);
export function isValidLanguage(lang) {
  return typeof lang === "string" && ALLOWED_LANGUAGES.has(lang.toLowerCase());
}

/**
 * Middleware factory: validate request body fields.
 * Returns 400 with specific errors if validation fails.
 */
export function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, validator, message] of rules) {
      const value = req.body[field];
      if (!validator(value)) {
        errors.push({ field, message });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    next();
  };
}
