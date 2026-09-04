const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getActivities,
} = require("../controllers/activityController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getActivities);

module.exports = router;