const rateLimit = require("express-rate-limit");

/*
 * General API limiter.
 *
 * 300 requests per 15 minutes per IP.
 * This is intentionally generous so normal Cloud Drive
 * usage is not affected.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    error: {
      code: "RATE_LIMITED",
      message:
        "Too many requests. Please try again later.",
    },
  },
});

/*
 * Authentication limiter.
 *
 * Protects login/register endpoints from brute-force
 * and automated abuse.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    error: {
      code: "RATE_LIMITED",
      message:
        "Too many authentication attempts. Please try again later.",
    },
  },
});

/*
 * Public-link limiter.
 *
 * Public links do not require authentication, so they
 * need their own protection against automated requests
 * and password guessing.
 */
const publicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    error: {
      code: "RATE_LIMITED",
      message:
        "Too many public-link requests. Please try again later.",
    },
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  publicLinkLimiter,
};