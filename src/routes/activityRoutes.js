const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getActivities,
} = require("../controllers/activityController");

const {
  validate,
  activitiesQuerySchema,
} = require("../middleware/validate");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  validate({
    query: activitiesQuerySchema,
  }),
  getActivities
);

module.exports = router;