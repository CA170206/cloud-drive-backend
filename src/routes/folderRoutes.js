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

const router = express.Router();

router.use(authMiddleware);

router.post("/", createFolder);

router.get("/", getFolders);

router.patch(
  "/:id",
  renameFolder
);

router.patch(
  "/:id/move",
  requireEditorAccess("folder"),
  moveFolder
);

router.delete(
  "/:id",
  deleteFolder
);

module.exports = router;