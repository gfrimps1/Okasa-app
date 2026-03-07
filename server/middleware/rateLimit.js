import rateLimit from "express-rate-limit";

/**
 * Global rate limiter — 100 requests per 15 minutes per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/**
 * Auth rate limiter — stricter for login/register (10 per 15 min).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

/**
 * Upload rate limiter — 5 uploads per 15 minutes (images).
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later." },
});

/**
 * Video upload rate limiter — 3 video uploads per hour.
 */
export const videoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many video uploads. Please try again later." },
});

/**
 * Generation trigger limiter — 2 generation requests per hour.
 */
export const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many generation requests. Please try again later." },
});

/**
 * Status polling limiter — 60 requests per minute (frontend polls every 2-3s).
 */
export const statusPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many status requests." },
});
