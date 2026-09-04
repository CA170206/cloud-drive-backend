const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  starResource,
  unstarResource,
  getStarredResources,
  checkStarStatus,
} = require("../controllers/starController");

const {
  validate,
  starBodySchema,
  starQuerySchema,
} = require("../middleware/validate");

const router = express.Router();

router.use(authMiddleware);

/* =========================================================
   GET STARRED RESOURCES
========================================================= */

router.get(
  "/",
  getStarredResources
);

/* =========================================================
   CHECK STAR STATUS
========================================================= */

router.get(
  "/check",
  validate({
    query: starQuerySchema,
  }),
  checkStarStatus
);

/* =========================================================
   STAR RESOURCE
========================================================= */

router.post(
  "/",
  validate({
    body: starBodySchema,
  }),
  starResource
);

/* =========================================================
   UNSTAR RESOURCE
========================================================= */

router.delete(
  "/",
  validate({
    body: starBodySchema,
  }),
  unstarResource
);

module.exports = router;