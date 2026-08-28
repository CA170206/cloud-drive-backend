const express = require("express");

const {
  createFolder,
  getFolders,
  renameFolder,
  deleteFolder,
} = require("../controllers/folderController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post("/", createFolder);

router.get("/", getFolders);

router.patch("/:id", renameFolder);

router.delete("/:id", deleteFolder);

module.exports = router;