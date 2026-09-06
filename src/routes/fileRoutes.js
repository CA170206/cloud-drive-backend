const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getUploadMode,
  handleBlobUpload,
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
  uploadNewVersion,
  getFileVersions,
  downloadFileVersion,
  restoreFileVersion,
  getRecentFiles,
} = require("../controllers/fileController");

const {
  requireEditorAccess,
} = require("../middleware/sharePermission");

const {
  secureDownloadPath,
} = require("../middleware/secureDownload");

const {
  validate,
  fileIdParamsSchema,
  fileVersionParamsSchema,
  getFilesQuerySchema,
  renameFileSchema,
  moveFileSchema,
  searchQuerySchema,
} = require("../middleware/validate");

const router = express.Router();

/* =========================================================
   MULTER LOCAL STORAGE SETUP
========================================================= */

// Vercel serverless filesystem is read-only outside /tmp
const uploadDir = process.env.VERCEL
  ? "/tmp/uploads"
  : path.join(__dirname, "../../uploads");

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create upload dir (may be read-only):", e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

/* =========================================================
   STORAGE MODE HELPER
========================================================= */

router.get(
  "/upload-mode",
  getUploadMode
);

/* =========================================================
   VERCEL BLOB UPLOAD AUTH
========================================================= */

const blobUploadAuth = (req, res, next) => {
  if (
    req.body &&
    req.body.type === "blob.upload-completed"
  ) {
    return next();
  }

  return authMiddleware(req, res, next);
};

/* =========================================================
   VERCEL BLOB CLIENT UPLOAD ROUTES
========================================================= */

router.post(
  "/blob-upload",
  blobUploadAuth,
  handleBlobUpload
);

router.post(
  "/upload-token",
  blobUploadAuth,
  handleBlobUpload
);

/* =========================================================
   AUTHENTICATED ROUTES
========================================================= */

router.use(
  authMiddleware
);

/* =========================================================
   FALLBACK / DIRECT MULTIPART UPLOAD ROUTES
========================================================= */

router.post(
  "/upload",
  uploadMiddleware.single("file"),
  uploadFile
);

router.post(
  "/:id/versions/upload-token",
  handleBlobUpload
);

router.post(
  "/:id/versions",
  uploadMiddleware.single("file"),
  uploadNewVersion
);

/* =========================================================
   VERSION ROUTES
========================================================= */

router.get(
  "/:id/versions",
  validate({
    params:
      fileIdParamsSchema,
  }),
  getFileVersions
);

router.get(
  "/:id/versions/:versionId/download",
  validate({
    params:
      fileVersionParamsSchema,
  }),
  secureDownloadPath(
    "version"
  ),
  downloadFileVersion
);

router.post(
  "/:id/versions/:versionId/restore",
  validate({
    params:
      fileVersionParamsSchema,
  }),
  restoreFileVersion
);

/* =========================================================
   STATIC ROUTES
========================================================= */

router.get(
  "/recent",
  getRecentFiles
);

router.get(
  "/stats",
  getStorageStats
);

router.get(
  "/search",
  validate({
    query:
      searchQuerySchema,
  }),
  searchFilesAndFolders
);

router.get(
  "/trash",
  getTrash
);

router.get(
  "/",
  validate({
    query:
      getFilesQuerySchema,
  }),
  getFiles
);

/* =========================================================
   FILE OPERATIONS
========================================================= */

router.patch(
  "/:id",
  validate({
    params:
      fileIdParamsSchema,
    body:
      renameFileSchema,
  }),
  requireEditorAccess(
    "file"
  ),
  renameFile
);

router.patch(
  "/:id/move",
  validate({
    params:
      fileIdParamsSchema,
    body:
      moveFileSchema,
  }),
  requireEditorAccess(
    "file"
  ),
  moveFile
);

/* =========================================================
   RESTORE
========================================================= */

router.patch(
  "/trash/:id/restore",
  validate({
    params:
      fileIdParamsSchema,
  }),
  restoreFile
);

router.patch(
  "/trash/folder/:id/restore",
  validate({
    params:
      fileIdParamsSchema,
  }),
  restoreFolder
);

/* =========================================================
   SECURE DOWNLOAD
========================================================= */

router.get(
  "/:id/download",
  validate({
    params:
      fileIdParamsSchema,
  }),
  secureDownloadPath(
    "file"
  ),
  downloadFile
);

/* =========================================================
   DELETE
========================================================= */

router.delete(
  "/:id",
  validate({
    params:
      fileIdParamsSchema,
  }),
  deleteFile
);

module.exports = router;