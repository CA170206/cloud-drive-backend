const express = require("express");

const {
  register,
  login,
  getMe,
  logout,
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authMiddleware");

const {
  validate,
  registerSchema,
  loginSchema,
} = require("../middleware/validate");

const {
  authLimiter,
} = require("../middleware/rateLimiter");

const router = express.Router();

/* =========================================================
   REGISTER
========================================================= */

router.post(
  "/register",
  authLimiter,
  validate({
    body: registerSchema,
  }),
  register
);

/* =========================================================
   LOGIN
========================================================= */

router.post(
  "/login",
  authLimiter,
  validate({
    body: loginSchema,
  }),
  login
);

/* =========================================================
   CURRENT USER
========================================================= */

router.get(
  "/me",
  authMiddleware,
  getMe
);

/* =========================================================
   LOGOUT
========================================================= */

router.post(
  "/logout",
  logout
);

module.exports = router;