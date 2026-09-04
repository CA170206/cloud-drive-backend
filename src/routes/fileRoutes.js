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
  secureDownloadPath,
} = require("../middleware/secureDownload");

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

const MAX_FILENAME_LENGTH =
  255;

const blockedExtensions =
  new Set([
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

const mimeByExtension = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".csv": [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
  ],
  ".json": ["application/json"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".zip": ["application/zip"],
  ".mp3": ["audio/mpeg"],
  ".wav": [
    "audio/wav",
    "audio/x-wav",
  ],
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm"],
};

/* =========================================================
   STORAGE
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
          file.originalname ||
            ""
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
   MULTER
========================================================= */

const upload =
  multer({
    storage,

    limits: {
      fileSize:
        MAX_FILE_SIZE,
      files: 1,
      fields: 10,
      parts: 11,
    },
  });

/* =========================================================
   DELETE TEMP FILE
========================================================= */

const deleteUploadedFile =
  async (file) => {
    if (!file?.path) {
      return;
    }

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
          "Could not delete rejected upload:",
          error.message
        );
      }
    }
  };

/* =========================================================
   VALIDATE UPLOADED FILE
========================================================= */

const validateUploadedFile =
  async (req, res) => {
    const file =
      req.file;

    if (!file) {
      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "FILE_REQUIRED",
              message:
                "Please select a file to upload",
            },
          }),
      };
    }

    const originalName =
      file.originalname ||
      "";

    const extension =
      path.extname(
        originalName
      ).toLowerCase();

    if (!originalName) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "Filename is required",
            },
          }),
      };
    }

    if (
      originalName.length >
      MAX_FILENAME_LENGTH
    ) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "Filename must be 255 characters or less",
            },
          }),
      };
    }

    if (
      /[\u0000-\u001F\u007F]/.test(
        originalName
      )
    ) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "Filename contains invalid characters",
            },
          }),
      };
    }

    if (
      originalName.includes(
        "/"
      ) ||
      originalName.includes(
        "\\"
      )
    ) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "Filename contains an invalid path",
            },
          }),
      };
    }

    if (!extension) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "File extension is required",
            },
          }),
      };
    }

    if (
      blockedExtensions.has(
        extension
      )
    ) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "This file type is not allowed",
            },
          }),
      };
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "File size must be 50 MB or less",
            },
          }),
      };
    }

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
      await deleteUploadedFile(
        file
      );

      return {
        valid: false,
        response:
          res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "File extension and MIME type do not match",
            },
          }),
      };
    }

    return {
      valid: true,
    };
  };

/* =========================================================
   PROCESS UPLOAD
========================================================= */

const processUpload =
  (req, res, next) => {
    upload.any()(
      req,
      res,
      async (error) => {
        if (error) {
          if (
            req.files &&
            Array.isArray(
              req.files
            )
          ) {
            for (
              const file of req.files
            ) {
              await deleteUploadedFile(
                file
              );
            }
          }

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

        if (
          !Array.isArray(
            req.files
          ) ||
          req.files.length === 0
        ) {
          req.file =
            undefined;

          return next();
        }

        if (
          req.files.length >
          1
        ) {
          for (
            const file of req.files
          ) {
            await deleteUploadedFile(
              file
            );
          }

          return res.status(400).json({
            error: {
              code:
                "UPLOAD_VALIDATION_ERROR",
              message:
                "Only one file can be uploaded at a time",
            },
          });
        }

        req.file =
          req.files[0];

        const validation =
          await validateUploadedFile(
            req,
            res
          );

        if (
          !validation.valid
        ) {
          return;
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
   VERSION UPLOAD
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
   SECURE NORMAL DOWNLOAD
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