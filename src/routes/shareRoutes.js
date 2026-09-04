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
  createPublicLink,
  getPublicLinks,
  accessPublicLink,
  deletePublicLink,
} = require("../controllers/shareController");

const router = express.Router();

/*
 * PUBLIC LINK ACCESS
 *
 * IMPORTANT:
 * This route must be BEFORE authMiddleware.
 * Anyone with the token can access it.
 */
router.get(
  "/public/:token",
  accessPublicLink
);

/*
 * All routes below require authentication.
 */
router.use(authMiddleware);

/*
 * Create a share / update an existing share
 */
router.post("/", createShare);

/*
 * Permission check
 */
router.get(
  "/permission",
  checkPermission
);

/*
 * Create public link
 */
router.post(
  "/public",
  createPublicLink
);

/*
 * Get public links for a resource
 */
router.get(
  "/public",
  getPublicLinks
);

/*
 * Delete public link
 */
router.delete(
  "/public/:id",
  deletePublicLink
);

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