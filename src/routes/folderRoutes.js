const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  createFolder,
  getFolders,
  renameFolder,
  moveFolder,
  deleteFolder,
} = require("../controllers/folderController");

const {
  requireEditorAccess,
} = require("../middleware/sharePermission");

const {
  validate,
  createFolderSchema,
  folderIdParamsSchema,
  getFoldersQuerySchema,
  renameFolderSchema,
  moveFolderSchema,
} = require("../middleware/validate");

const router = express.Router();

router.use(authMiddleware);

/* =========================================================
   CREATE FOLDER
========================================================= */

router.post(
  "/",
  validate({
    body: createFolderSchema,
  }),
  createFolder
);

/* =========================================================
   GET FOLDERS
========================================================= */

router.get(
  "/",
  validate({
    query: getFoldersQuerySchema,
  }),
  getFolders
);

/* =========================================================
   RENAME FOLDER
========================================================= */

router.patch(
  "/:id",
  validate({
    params: folderIdParamsSchema,
    body: renameFolderSchema,
  }),
  renameFolder
);

/* =========================================================
   MOVE FOLDER
========================================================= */

router.patch(
  "/:id/move",
  validate({
    params: folderIdParamsSchema,
    body: moveFolderSchema,
  }),
  requireEditorAccess("folder"),
  moveFolder
);

/* =========================================================
   DELETE FOLDER
========================================================= */

router.delete(
  "/:id",
  validate({
    params: folderIdParamsSchema,
  }),
  deleteFolder
);

module.exports = router;