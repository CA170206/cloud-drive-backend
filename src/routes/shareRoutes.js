const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  createShare,
  getResourceShares,
  getSharedWithMe,
  getSharedFolderContents,
  downloadSharedFile,
  checkPermission,
  removeSharedWithMe,
  deleteShare,
  createPublicLink,
  getPublicLinks,
  accessPublicLink,
  deletePublicLink,
} = require("../controllers/shareController");

const {
  secureDownloadPath,
} = require("../middleware/secureDownload");

const {
  validate,
  createShareSchema,
  resourceQuerySchema,
  sharedFolderParamsSchema,
  sharedFileParamsSchema,
  shareIdParamsSchema,
  publicLinkTokenParamsSchema,
  createPublicLinkSchema,
  publicLinkPasswordQuerySchema,
} = require("../middleware/validate");

const {
  publicLinkLimiter,
} = require("../middleware/rateLimiter");

const router = express.Router();

/* =========================================================
   PUBLIC LINK ACCESS
========================================================= */

router.get(
  "/public/:token",
  publicLinkLimiter,
  validate({
    params:
      publicLinkTokenParamsSchema,

    query:
      publicLinkPasswordQuerySchema,
  }),
  secureDownloadPath(
    "public"
  ),
  accessPublicLink
);

/* =========================================================
   AUTHENTICATED ROUTES
========================================================= */

router.use(
  authMiddleware
);

/* =========================================================
   CREATE / UPDATE SHARE
========================================================= */

router.post(
  "/",
  validate({
    body:
      createShareSchema,
  }),
  createShare
);

/* =========================================================
   PERMISSION CHECK
========================================================= */

router.get(
  "/permission",
  validate({
    query:
      resourceQuerySchema,
  }),
  checkPermission
);

/* =========================================================
   CREATE PUBLIC LINK
========================================================= */

router.post(
  "/public",
  validate({
    body:
      createPublicLinkSchema,
  }),
  createPublicLink
);

/* =========================================================
   GET PUBLIC LINKS
========================================================= */

router.get(
  "/public",
  validate({
    query:
      resourceQuerySchema,
  }),
  getPublicLinks
);

/* =========================================================
   DELETE PUBLIC LINK
========================================================= */

router.delete(
  "/public/:id",
  validate({
    params:
      shareIdParamsSchema,
  }),
  deletePublicLink
);

/* =========================================================
   SHARED WITH ME
========================================================= */

router.get(
  "/shared-with-me",
  getSharedWithMe
);

/* =========================================================
   SHARED FOLDER CONTENTS
========================================================= */

router.get(
  "/shared-with-me/folder/:id",
  validate({
    params:
      sharedFolderParamsSchema,
  }),
  getSharedFolderContents
);

/* =========================================================
   SECURE SHARED FILE DOWNLOAD
========================================================= */

router.get(
  "/shared-with-me/:id/download",
  validate({
    params:
      sharedFileParamsSchema,
  }),
  secureDownloadPath(
    "file"
  ),
  downloadSharedFile
);

/* =========================================================
   REMOVE SHARED RESOURCE
========================================================= */

router.delete(
  "/shared-with-me/:id",
  validate({
    params:
      shareIdParamsSchema,
  }),
  removeSharedWithMe
);

/* =========================================================
   GET SHARES FOR OWNED RESOURCE
========================================================= */

router.get(
  "/",
  validate({
    query:
      resourceQuerySchema,
  }),
  getResourceShares
);

/* =========================================================
   DELETE SHARE
========================================================= */

router.delete(
  "/:id",
  validate({
    params:
      shareIdParamsSchema,
  }),
  deleteShare
);

module.exports = router;