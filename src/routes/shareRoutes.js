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

const router = express.Router();

/* =========================================================
   PUBLIC LINK ACCESS

   Must remain BEFORE authMiddleware.
========================================================= */

router.get(
  "/public/:token",
  validate({
    params:
      publicLinkTokenParamsSchema,

    query:
      publicLinkPasswordQuerySchema,
  }),
  accessPublicLink
);

/* =========================================================
   AUTHENTICATED ROUTES
========================================================= */

router.use(authMiddleware);

/* =========================================================
   CREATE / UPDATE SHARE
========================================================= */

router.post(
  "/",
  validate({
    body: createShareSchema,
  }),
  createShare
);

/* =========================================================
   PERMISSION CHECK
========================================================= */

router.get(
  "/permission",
  validate({
    query: resourceQuerySchema,
  }),
  checkPermission
);

/* =========================================================
   CREATE PUBLIC LINK
========================================================= */

router.post(
  "/public",
  validate({
    body: createPublicLinkSchema,
  }),
  createPublicLink
);

/* =========================================================
   GET PUBLIC LINKS
========================================================= */

router.get(
  "/public",
  validate({
    query: resourceQuerySchema,
  }),
  getPublicLinks
);

/* =========================================================
   DELETE PUBLIC LINK
========================================================= */

router.delete(
  "/public/:id",
  validate({
    params: shareIdParamsSchema,
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
   DOWNLOAD SHARED FILE
========================================================= */

router.get(
  "/shared-with-me/:id/download",
  validate({
    params:
      sharedFileParamsSchema,
  }),
  downloadSharedFile
);

/* =========================================================
   REMOVE FROM SHARED WITH ME
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
    query: resourceQuerySchema,
  }),
  getResourceShares
);

/* =========================================================
   OWNER REMOVES SHARE
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