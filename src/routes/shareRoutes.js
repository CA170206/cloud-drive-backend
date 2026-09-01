const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  createShare,
  getResourceShares,
  getSharedWithMe,
  getSharedFolderContents,
  downloadSharedFile,
  getSharedPermission,
  checkPermission,
  removeSharedWithMe,
  deleteShare,
} = require("../controllers/shareController");

const router = express.Router();

router.use(authMiddleware);

/*
 * Create a share / update an existing share
 */
router.post("/", createShare);

/*
 * Permission check
 *
 * IMPORTANT:
 * Keep this BEFORE /:id routes.
 */
router.get("/permission", checkPermission);

/*
 * Shared with me
 */
router.get(
  "/shared-with-me",
  getSharedWithMe
);

/*
 * Shared folder contents
 */
router.get(
  "/shared-with-me/folder/:id",
  getSharedFolderContents
);

/*
 * Download shared file
 */
router.get(
  "/shared-with-me/:id/download",
  downloadSharedFile
);

/*
 * Remove item from Shared with me
 */
router.delete(
  "/shared-with-me/:id",
  removeSharedWithMe
);

/*
 * Get shares for an owned resource
 */
router.get(
  "/",
  getResourceShares
);

/*
 * Owner removes a share
 */
router.delete(
  "/:id",
  deleteShare
);

module.exports = router;