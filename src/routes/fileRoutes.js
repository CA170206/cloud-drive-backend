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
  validate,
  fileIdParamsSchema,
  fileVersionParamsSchema,
  getFilesQuerySchema,
  uploadFileBodySchema,
  renameFileSchema,
  moveFileSchema,
  searchQuerySchema,
} = require("../middleware/validate");

const router = express.Router();

/* =========================================================
   MULTER STORAGE
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(
      null,
      path.join(
        __dirname,
        "../../uploads"
      )
    );
  },

  filename: (req, file, cb) => {
    const extension =
      path.extname(
        file.originalname || ""
      );

    const uniqueName =
      `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize:
      50 * 1024 * 1024,

    files: 1,

    fields: 10,

    parts: 11,
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
  upload.single("file"),
  validate({
    body: uploadFileBodySchema,
  }),
  (req, res) => {
    if (
      !req.file
    ) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message:
            "Please select a file to upload",
        },
      });
    }

    return uploadFile(
      req,
      res
    );
  }
);

/* =========================================================
   FILE VERSIONING
========================================================= */

router.post(
  "/:id/versions",
  upload.single("file"),
  validate({
    params: fileIdParamsSchema,
    body: uploadFileBodySchema,
  }),
  (req, res) => {
    if (
      !req.file
    ) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message:
            "Please select a file to upload",
        },
      });
    }

    return uploadNewVersion(
      req,
      res
    );
  }
);

router.get(
  "/:id/versions",
  validate({
    params: fileIdParamsSchema,
  }),
  getFileVersions
);

router.get(
  "/:id/versions/:versionId/download",
  validate({
    params:
      fileVersionParamsSchema,
  }),
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
   RECENT FILES
========================================================= */

router.get(
  "/recent",
  getRecentFiles
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
   SEARCH

   Keep before /:id routes.
========================================================= */

router.get(
  "/search",
  validate({
    query: searchQuerySchema,
  }),
  searchFilesAndFolders
);

/* =========================================================
   GET FILES
========================================================= */

router.get(
  "/",
  validate({
    query: getFilesQuerySchema,
  }),
  getFiles
);

/* =========================================================
   RENAME FILE
========================================================= */

router.patch(
  "/:id",
  validate({
    params: fileIdParamsSchema,
    body: renameFileSchema,
  }),
  requireEditorAccess("file"),
  renameFile
);

/* =========================================================
   MOVE FILE
========================================================= */

router.patch(
  "/:id/move",
  validate({
    params: fileIdParamsSchema,
    body: moveFileSchema,
  }),
  requireEditorAccess("file"),
  moveFile
);

/* =========================================================
   TRASH
========================================================= */

router.get(
  "/trash",
  getTrash
);

router.patch(
  "/trash/:id/restore",
  validate({
    params: fileIdParamsSchema,
  }),
  restoreFile
);

router.patch(
  "/trash/folder/:id/restore",
  validate({
    params: fileIdParamsSchema,
  }),
  restoreFolder
);

/* =========================================================
   DOWNLOAD FILE
========================================================= */

router.get(
  "/:id/download",
  validate({
    params: fileIdParamsSchema,
  }),
  downloadFile
);

/* =========================================================
   DELETE FILE
========================================================= */

router.delete(
  "/:id",
  validate({
    params: fileIdParamsSchema,
  }),
  deleteFile
);

module.exports = router;