// backend/src/routes/starRoutes.js

const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  starResource,
  unstarResource,
  getStarredResources,
  checkStarStatus,
} = require("../controllers/starController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getStarredResources);

router.get("/check", checkStarStatus);

router.post("/", starResource);

router.delete("/", unstarResource);

module.exports = router;