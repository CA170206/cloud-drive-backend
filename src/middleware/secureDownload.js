const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");

const uploadsDir = path.resolve(
  __dirname,
  "../../uploads"
);

/* =========================================================
   VALIDATE STORAGE PATH
========================================================= */

const isSafeStorageKey = (
  storageKey
) => {
  if (
    typeof storageKey !==
    "string"
  ) {
    return false;
  }

  if (!storageKey) {
    return false;
  }

  if (
    storageKey.startsWith("http://") ||
    storageKey.startsWith("https://") ||
    storageKey.startsWith("users/")
  ) {
    return true;
  }

  const cleanKey = storageKey.replace(/^uploads[/\\]/, "");

  if (
    cleanKey.includes("\0") ||
    cleanKey.includes("..")
  ) {
    return false;
  }

  const resolvedPath =
    path.resolve(
      uploadsDir,
      cleanKey
    );

  const relativePath =
    path.relative(
      uploadsDir,
      resolvedPath
    );

  if (
    relativePath.startsWith(
      ".." + path.sep
    ) ||
    relativePath === ".." ||
    path.isAbsolute(
      relativePath
    )
  ) {
    return false;
  }

  return true;
};

/* =========================================================
   SECURE DOWNLOAD PATH
========================================================= */

const secureDownloadPath =
  (type) => {
    return async (
      req,
      res,
      next
    ) => {
      try {
        let result;

        /* ================================================
           NORMAL FILE / SHARED FILE
        ================================================ */

        if (
          type === "file"
        ) {
          const {
            id,
          } = req.params;

          result =
            await pool.query(
              `SELECT storage_key
               FROM files
               WHERE id = $1
               LIMIT 1`,
              [id]
            );
        }

        /* ================================================
           FILE VERSION
        ================================================ */

        if (
          type === "version"
        ) {
          const {
            id,
            versionId,
          } = req.params;

          result =
            await pool.query(
              `SELECT fv.storage_key
               FROM file_versions fv
               INNER JOIN files f
                 ON f.id = fv.file_id
               WHERE fv.id = $1
                 AND fv.file_id = $2
               LIMIT 1`,
              [
                versionId,
                id,
              ]
            );
        }

        /* ================================================
           PUBLIC LINK
        ================================================ */

        if (
          type === "public"
        ) {
          const {
            token,
          } = req.params;

          result =
            await pool.query(
              `SELECT f.storage_key
               FROM link_shares l
               INNER JOIN files f
                 ON f.id = l.resource_id
               WHERE l.token = $1
                 AND l.resource_type = 'file'
               LIMIT 1`,
              [token]
            );
        }

        if (
          !result ||
          result.rows.length === 0
        ) {
          return res.status(404).json({
            error: {
              code:
                type === "version"
                  ? "VERSION_NOT_FOUND"
                  : "FILE_NOT_FOUND",
              message:
                type === "version"
                  ? "File version not found"
                  : "File not found",
            },
          });
        }

        const storageKey =
          result.rows[0]
            .storage_key;

        if (
          !isSafeStorageKey(
            storageKey
          )
        ) {
          console.error(
            "Unsafe storage key detected:",
            {
              type,
              resourceId:
                req.params?.id,
              versionId:
                req.params
                  ?.versionId,
            }
          );

          return res.status(500).json({
            error: {
              code:
                "INVALID_STORAGE_PATH",
              message:
                "Stored file path is invalid",
            },
          });
        }

        const isBlobRemote =
          storageKey.startsWith("http://") ||
          storageKey.startsWith("https://") ||
          storageKey.startsWith("users/");

        if (!isBlobRemote) {
          const cleanKey = storageKey.replace(/^uploads[/\\]/, "");
          const filePath =
            path.resolve(
              uploadsDir,
              cleanKey
            );

          try {
            const stats =
              await fs.promises.stat(
                filePath
              );

            if (
              !stats.isFile()
            ) {
              return res.status(404).json({
                error: {
                  code:
                    "STORAGE_FILE_NOT_FOUND",
                  message:
                    "Stored file not found",
                },
              });
            }
          } catch (error) {
            if (
              error.code ===
              "ENOENT"
            ) {
              return res.status(404).json({
                error: {
                  code:
                    "STORAGE_FILE_NOT_FOUND",
                  message:
                    "Stored file not found",
                },
              });
            }

            throw error;
          }

          req.secureFilePath =
            filePath;
        }

        next();
      } catch (error) {
        console.error(
          "Secure download path error:",
          error
        );

        return res.status(500).json({
          error: {
            code:
              "INTERNAL_ERROR",
            message:
              "Unable to verify download path",
          },
        });
      }
    };
  };

module.exports = {
  secureDownloadPath,
  isSafeStorageKey,
};