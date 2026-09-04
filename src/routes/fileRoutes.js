const express = require("express");
const multer = require("multer");
const path = require("path");

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadFile,
  getFiles,
  getStorageStats,
  renameFile,
  moveFile,
  downloadFile,
  deleteFile,
  getTrash,
  restoreFile,
  restoreFolder,
  searchFilesAndFolders,
} = require("../controllers/fileController");

const {
  requireEditorAccess,
} = require("../middleware/sharePermission");

const router = express.Router();

/* =========================================================
   MULTER STORAGE
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(
      null,
      path.join(__dirname, "../../uploads")
    );
  },

  filename: (req, file, cb) => {
    const uniqueName =
      `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}` +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

/* =========================================================
   AUTH
========================================================= */

router.use(authMiddleware);

/* =========================================================
   UPLOAD
========================================================= */

router.post(
  "/upload",
  upload.any(),
  (req, res) => {
    if (
      !req.files ||
      req.files.length === 0
    ) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message:
            "Please select a file to upload",
        },
      });
    }

    req.file = req.files[0];

    return uploadFile(req, res);
  }
);

/* =========================================================
   STORAGE STATS

   Keep before /:id routes.
========================================================= */

router.get(
  "/stats",
  getStorageStats
);

/* =========================================================
   GET FILES
========================================================= */

router.get(
  "/",
  getFiles
);

/* =========================================================
   RENAME FILE

   Owner + Editor
   Viewer → 403
========================================================= */

router.patch(
  "/:id",
  requireEditorAccess("file"),
  renameFile
);


router.patch(
  "/:id/move",
  requireEditorAccess("file"),
  moveFile
);

router.get(
  "/trash",
  getTrash
);

router.patch(
  "/trash/:id/restore",
  restoreFile
);

router.patch(
  "/trash/folder/:id/restore",
  restoreFolder
);

/* =========================================================
   DOWNLOAD FILE
========================================================= */

router.get(
  "/:id/download",
  downloadFile
);

/* =========================================================
   DELETE FILE
========================================================= */

router.delete(
  "/:id",
  deleteFile
);

router.get(
  "/search",
  searchFilesAndFolders
);

module.exports = router;