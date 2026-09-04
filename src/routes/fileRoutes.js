const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
   UPLOAD SECURITY
========================================================= */

const MAX_FILE_SIZE =
  50 * 1024 * 1024;

const MAX_FILENAME_LENGTH = 255;

/*
 * Executable/script extensions are blocked.
 *
 * Cloud Drive stores user files and does not need to
 * execute uploaded files on the server.
 */
const blockedExtensions = new Set([
  ".exe",
  ".dll",
  ".com",
  ".msi",
  ".scr",
  ".bat",
  ".cmd",
  ".ps1",
  ".psm1",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".mjs",
  ".cjs",
  ".jar",
  ".sh",
  ".bash",
  ".zsh",
  ".php",
  ".php3",
  ".php4",
  ".php5",
  ".phtml",
  ".cgi",
  ".pl",
  ".py",
  ".rb",
  ".asp",
  ".aspx",
  ".jsp",
  ".war",
  ".hta",
]);

/*
 * MIME types which we explicitly understand.
 *
 * application/octet-stream is intentionally allowed for
 * files whose MIME type cannot be reliably determined by
 * the client. The extension is still checked separately.
 */
const mimeByExtension = {
  ".jpg": [
    "image/jpeg",
  ],

  ".jpeg": [
    "image/jpeg",
  ],

  ".png": [
    "image/png",
  ],

  ".gif": [
    "image/gif",
  ],

  ".webp": [
    "image/webp",
  ],

  ".pdf": [
    "application/pdf",
  ],

  ".txt": [
    "text/plain",
  ],

  ".csv": [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
  ],

  ".json": [
    "application/json",
  ],

  ".doc": [
    "application/msword",
  ],

  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],

  ".xls": [
    "application/vnd.ms-excel",
  ],

  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],

  ".ppt": [
    "application/vnd.ms-powerpoint",
  ],

  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],

  ".zip": [
    "application/zip",
  ],

  ".mp3": [
    "audio/mpeg",
  ],

  ".wav": [
    "audio/wav",
    "audio/x-wav",
  ],

  ".mp4": [
    "video/mp4",
  ],

  ".webm": [
    "video/webm",
  ],
};

/* =========================================================
   MULTER STORAGE
========================================================= */

const storage =
  multer.diskStorage({
    destination: (
      req,
      file,
      cb
    ) => {
      cb(
        null,
        path.join(
          __dirname,
          "../../uploads"
        )
      );
    },

    filename: (
      req,
      file,
      cb
    ) => {
      const extension =
        path.extname(
          file.originalname || ""
        ).toLowerCase();

      const uniqueName =
        `${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${extension}`;

      cb(
        null,
        uniqueName
      );
    },
  });

/* =========================================================
   MULTER FILE FILTER
========================================================= */

const fileFilter = (
  req,
  file,
  cb
) => {
  try {
    const originalName =
      file.originalname || "";

    const extension =
      path.extname(
        originalName
      ).toLowerCase();

    /*
     * Filename must exist.
     */
    if (!originalName) {
      return cb(
        new Error(
          "Filename is required"
        ),
        false
      );
    }

    /*
     * Reject excessively long filenames.
     */
    if (
      originalName.length >
      MAX_FILENAME_LENGTH
    ) {
      return cb(
        new Error(
          "Filename must be 255 characters or less"
        ),
        false
      );
    }

    /*
     * Reject null bytes and control characters.
     */
    if (
      /[\u0000-\u001F\u007F]/.test(
        originalName
      )
    ) {
      return cb(
        new Error(
          "Filename contains invalid characters"
        ),
        false
      );
    }

    /*
     * Reject path separators.
     *
     * The server generates its own storage filename,
     * but user supplied path characters should still
     * never be accepted.
     */
    if (
      originalName.includes("/") ||
      originalName.includes("\\")
    ) {
      return cb(
        new Error(
          "Filename contains an invalid path"
        ),
        false
      );
    }

    /*
     * Reject executable/script extensions.
     */
    if (
      blockedExtensions.has(
        extension
      )
    ) {
      return cb(
        new Error(
          "This file type is not allowed"
        ),
        false
      );
    }

    /*
     * An extension is required.
     */
    if (!extension) {
      return cb(
        new Error(
          "File extension is required"
        ),
        false
      );
    }

    /*
     * Validate known MIME/extension pairs.
     *
     * Unknown MIME types are allowed when the extension
     * itself is not dangerous.
     */
    const expectedMimeTypes =
      mimeByExtension[
        extension
      ];

    if (
      expectedMimeTypes &&
      file.mimetype &&
      file.mimetype !==
        "application/octet-stream" &&
      !expectedMimeTypes.includes(
        file.mimetype
      )
    ) {
      return cb(
        new Error(
          "File extension and MIME type do not match"
        ),
        false
      );
    }

    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

/* =========================================================
   MULTER INSTANCE
========================================================= */

const upload =
  multer({
    storage,
    fileFilter,

    limits: {
      fileSize:
        MAX_FILE_SIZE,

      /*
       * Only one file should be uploaded by each request.
       */
      files: 1,

      /*
       * Prevent excessive multipart fields.
       */
      fields: 10,

      /*
       * One file + up to 10 fields.
       */
      parts: 11,
    },
  });

/* =========================================================
   CLEANUP
========================================================= */

const cleanupUploadedFiles =
  async (req) => {
    const files = [];

    if (req.file) {
      files.push(req.file);
    }

    if (
      Array.isArray(req.files)
    ) {
      files.push(
        ...req.files
      );
    }

    for (const file of files) {
      if (
        file?.path
      ) {
        try {
          await fs.promises.unlink(
            file.path
          );
        } catch (error) {
          if (
            error.code !==
            "ENOENT"
          ) {
            console.error(
              "Could not clean up rejected upload:",
              error.message
            );
          }
        }
      }
    }
  };

/* =========================================================
   UPLOAD MIDDLEWARE
========================================================= */

const processUpload =
  (req, res, next) => {
    upload.any()(
      req,
      res,
      async (error) => {
        if (error) {
          await cleanupUploadedFiles(
            req
          );

          if (
            error instanceof
            multer.MulterError
          ) {
            let message =
              "Upload failed";

            if (
              error.code ===
              "LIMIT_FILE_SIZE"
            ) {
              message =
                "File size must be 50 MB or less";
            } else if (
              error.code ===
              "LIMIT_FILE_COUNT"
            ) {
              message =
                "Only one file can be uploaded at a time";
            } else if (
              error.code ===
              "LIMIT_PART_COUNT"
            ) {
              message =
                "Too many multipart fields";
            }

            return res.status(400).json({
              error: {
                code:
                  "UPLOAD_VALIDATION_ERROR",
                message,
              },
            });
          }

          return res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                error.message ||
                "Invalid file upload",
            },
          });
        }

        /*
         * upload.any() stores files in req.files.
         *
         * We explicitly enforce exactly zero or one file.
         */
        if (
          Array.isArray(req.files) &&
          req.files.length > 1
        ) {
          await cleanupUploadedFiles(
            req
          );

          return res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "Only one file can be uploaded at a time",
            },
          });
        }

        if (
          Array.isArray(req.files) &&
          req.files.length === 1
        ) {
          req.file =
            req.files[0];
        }

        /*
         * Final validation after Multer.
         */
        if (req.file) {
          const originalName =
            req.file.originalname ||
            "";

          if (
            originalName.length >
            MAX_FILENAME_LENGTH
          ) {
            await cleanupUploadedFiles(
              req
            );

            return res.status(400).json({
              error: {
                code:
                  "UPLOAD_VALIDATION_ERROR",
                message:
                  "Filename must be 255 characters or less",
              },
            });
          }

          if (
            req.file.size >
            MAX_FILE_SIZE
          ) {
            await cleanupUploadedFiles(
              req
            );

            return res.status(400).json({
              error: {
                code:
                  "UPLOAD_VALIDATION_ERROR",
                message:
                  "File size must be 50 MB or less",
              },
            });
          }
        }

        next();
      }
    );
  };

/* =========================================================
   AUTH
========================================================= */

router.use(
  authMiddleware
);

/* =========================================================
   UPLOAD
========================================================= */

router.post(
  "/upload",
  processUpload,
  validate({
    body:
      uploadFileBodySchema,
  }),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code:
            "FILE_REQUIRED",
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
  validate({
    params:
      fileIdParamsSchema,
  }),
  processUpload,
  validate({
    body:
      uploadFileBodySchema,
  }),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code:
            "FILE_REQUIRED",
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

router.get(
  "/:id/download",
  validate({
    params:
      fileIdParamsSchema,
  }),
  downloadFile
);

router.delete(
  "/:id",
  validate({
    params:
      fileIdParamsSchema,
  }),
  deleteFile
);

module.exports = router;