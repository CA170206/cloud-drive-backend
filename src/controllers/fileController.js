const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { pool } = require("../config/database");
const {
  getResourcePermission,
} = require("../middleware/sharePermission");

const uploadsDir = path.join(__dirname, "../../uploads");

/* =========================================================
   PAGINATION HELPER
========================================================= */

const getPagination = (req) => {
  const query = req.validatedQuery || req.query || {};

  const rawPage = query.page;
  const rawLimit = query.limit;

  const page = Math.max(
    1,
    Number.parseInt(rawPage || "1", 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(rawLimit || "20", 10) || 20
    )
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

/* =========================================================
   UPLOAD FILE
========================================================= */

const uploadFile = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { folderId = null } = req.body;

    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message: "Please select a file to upload",
        },
      });
    }

    if (folderId) {
      const folder = await pool.query(
        `SELECT id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [folderId, ownerId]
      );

      if (folder.rows.length === 0) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}

        return res.status(404).json({
          error: {
            code: "FOLDER_NOT_FOUND",
            message: "Folder not found",
          },
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO files
       (
         name,
         mime_type,
         size_bytes,
         storage_key,
         owner_id,
         folder_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         name,
         mime_type,
         size_bytes,
         owner_id,
         folder_id,
         created_at,
         updated_at`,
      [
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.filename,
        ownerId,
        folderId,
      ]
    );

    return res.status(201).json({
      success: true,
      file: result.rows[0],
    });
  } catch (error) {
    console.error("Upload file error:", error);

    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to upload file",
      },
    });
  }
};

/* =========================================================
   GET FILES
========================================================= */

const getFiles = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const query = req.validatedQuery || req.query || {};

    const folderId = query.folderId;

    const {
      page,
      limit,
      offset,
    } = getPagination(req);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM files
       WHERE owner_id = $1
         AND is_deleted = FALSE
         AND (
           ($2::uuid IS NULL AND folder_id IS NULL)
           OR folder_id = $2::uuid
         )`,
      [ownerId, folderId || null]
    );

    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit);

    const result = await pool.query(
      `SELECT
         id,
         name,
         mime_type,
         size_bytes,
         owner_id,
         folder_id,
         created_at,
         updated_at
       FROM files
       WHERE owner_id = $1
         AND is_deleted = FALSE
         AND (
           ($2::uuid IS NULL AND folder_id IS NULL)
           OR folder_id = $2::uuid
         )
       ORDER BY name ASC, id ASC
       LIMIT $3
       OFFSET $4`,
      [
        ownerId,
        folderId || null,
        limit,
        offset,
      ]
    );

    return res.status(200).json({
      success: true,
      files: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get files error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch files",
      },
    });
  }
};

/* =========================================================
   STORAGE STATS
========================================================= */

const getStorageStats = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const files = await pool.query(
      `SELECT
         COUNT(*)::int AS file_count,
         COALESCE(
           SUM(size_bytes),
           0
         )::bigint AS storage_used
       FROM files
       WHERE owner_id = $1
         AND is_deleted = FALSE`,
      [ownerId]
    );

    const folders = await pool.query(
      `SELECT
         COUNT(*)::int AS folder_count
       FROM folders
       WHERE owner_id = $1
         AND is_deleted = FALSE`,
      [ownerId]
    );

    return res.status(200).json({
      success: true,
      stats: {
        fileCount: files.rows[0].file_count,
        folderCount: folders.rows[0].folder_count,
        storageUsed: Number(
          files.rows[0].storage_used
        ),
      },
    });
  } catch (error) {
    console.error(
      "Get storage stats error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to fetch storage statistics",
      },
    });
  }
};

/* =========================================================
   RENAME FILE
   Owner + Editor
========================================================= */

const renameFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "File name is required",
        },
      });
    }

    const trimmedName = name.trim();

    if (trimmedName.length > 255) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "File name must be 255 characters or less",
        },
      });
    }

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    if (
      permission.role !== "owner" &&
      permission.role !== "editor"
    ) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "You only have viewer permission for this file",
        },
      });
    }

    const result = await pool.query(
      `UPDATE files
       SET name = $1,
           updated_at = NOW()
       WHERE id = $2
         AND is_deleted = FALSE
       RETURNING
         id,
         name,
         mime_type,
         size_bytes,
         owner_id,
         folder_id,
         created_at,
         updated_at`,
      [trimmedName, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "File renamed successfully",
      file: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Rename file error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to rename file",
      },
    });
  }
};

/* =========================================================
   MOVE FILE
   Owner + Editor
========================================================= */

const moveFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { folderId = null } = req.body;

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    if (
      permission.role !== "owner" &&
      permission.role !== "editor"
    ) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "You only have viewer permission for this file",
        },
      });
    }

    const fileResult = await pool.query(
      `SELECT
         id,
         name,
         owner_id,
         folder_id,
         is_deleted
       FROM files
       WHERE id = $1
         AND is_deleted = FALSE`,
      [id]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    const file = fileResult.rows[0];

    if (
      folderId === null ||
      folderId === ""
    ) {
      const result = await pool.query(
        `UPDATE files
         SET folder_id = NULL,
             updated_at = NOW()
         WHERE id = $1
           AND is_deleted = FALSE
         RETURNING
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at`,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "File moved successfully",
        file: result.rows[0],
      });
    }

    const folderResult = await pool.query(
      `SELECT
         id,
         owner_id,
         parent_id,
         is_deleted
       FROM folders
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [
        folderId,
        file.owner_id,
      ]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code:
            "DESTINATION_FOLDER_NOT_FOUND",
          message:
            "Destination folder not found",
        },
      });
    }

    if (
      file.folder_id === folderId
    ) {
      return res.status(400).json({
        error: {
          code: "ALREADY_IN_FOLDER",
          message:
            "File is already in this folder",
        },
      });
    }

    const result = await pool.query(
      `UPDATE files
       SET folder_id = $1,
           updated_at = NOW()
       WHERE id = $2
         AND is_deleted = FALSE
       RETURNING
         id,
         name,
         mime_type,
         size_bytes,
         owner_id,
         folder_id,
         created_at,
         updated_at`,
      [
        folderId,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "File moved successfully",
      file: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Move file error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to move file",
      },
    });
  }
};

/* =========================================================
   DOWNLOAD FILE
========================================================= */

const downloadFile = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         name,
         storage_key,
         mime_type
       FROM files
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    const file = result.rows[0];

    const filePath = path.join(
      uploadsDir,
      file.storage_key
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: {
          code:
            "STORAGE_FILE_NOT_FOUND",
          message:
            "Stored file not found",
        },
      });
    }

    return res.download(
      filePath,
      file.name
    );
  } catch (error) {
    console.error(
      "Download file error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to download file",
      },
    });
  }
};

/* =========================================================
   DELETE FILE
========================================================= */

const deleteFile = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE files
       SET is_deleted = TRUE,
           updated_at = NOW()
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE
       RETURNING id`,
      [id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "File deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete file error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to delete file",
      },
    });
  }
};

/* =========================================================
   FILE VERSIONING
========================================================= */

const calculateChecksum = (filePath) => {
  return new Promise(
    (resolve, reject) => {
      const hash =
        crypto.createHash(
          "sha256"
        );

      const stream =
        fs.createReadStream(
          filePath
        );

      stream.on(
        "data",
        (chunk) =>
          hash.update(chunk)
      );

      stream.on(
        "end",
        () =>
          resolve(
            hash.digest("hex")
          )
      );

      stream.on(
        "error",
        reject
      );
    }
  );
};

const uploadNewVersion = async (
  req,
  res
) => {
  const client =
    await pool.connect();

  try {
    const userId =
      req.user.userId;

    const { id } =
      req.params;

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

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}

      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    if (
      permission.role !==
        "owner" &&
      permission.role !==
        "editor"
    ) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}

      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "You only have viewer permission for this file",
        },
      });
    }

    const fileResult =
      await client.query(
        `SELECT
           id,
           name,
           mime_type,
           size_bytes,
           storage_key,
           owner_id,
           is_deleted
         FROM files
         WHERE id = $1
           AND is_deleted = FALSE`,
        [id]
      );

    if (
      fileResult.rows.length ===
      0
    ) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}

      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    const currentFile =
      fileResult.rows[0];

    const checksum =
      await calculateChecksum(
        req.file.path
      );

    await client.query(
      "BEGIN"
    );

    const versionResult =
      await client.query(
        `SELECT
           COALESCE(
             MAX(version_number),
             0
           )::int AS max_version
         FROM file_versions
         WHERE file_id = $1`,
        [id]
      );

    let nextVersion =
      versionResult.rows[0]
        .max_version + 1;

    if (
      nextVersion === 1
    ) {
      let currentChecksum =
        null;

      const currentPath =
        path.join(
          uploadsDir,
          currentFile.storage_key
        );

      if (
        fs.existsSync(
          currentPath
        )
      ) {
        try {
          currentChecksum =
            await calculateChecksum(
              currentPath
            );
        } catch {}
      }

      await client.query(
        `INSERT INTO file_versions
         (
           file_id,
           version_number,
           storage_key,
           size_bytes,
           checksum
         )
         VALUES
         ($1, $2, $3, $4, $5)`,
        [
          id,
          1,
          currentFile.storage_key,
          currentFile.size_bytes,
          currentChecksum,
        ]
      );

      nextVersion = 2;
    }

    await client.query(
      `INSERT INTO file_versions
       (
         file_id,
         version_number,
         storage_key,
         size_bytes,
         checksum
       )
       VALUES
       ($1, $2, $3, $4, $5)`,
      [
        id,
        nextVersion,
        req.file.filename,
        req.file.size,
        checksum,
      ]
    );

    const updatedFile =
      await client.query(
        `UPDATE files
         SET name = $1,
             mime_type = $2,
             size_bytes = $3,
             storage_key = $4,
             updated_at = NOW()
         WHERE id = $5
           AND is_deleted = FALSE
         RETURNING
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at`,
        [
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.file.filename,
          id,
        ]
      );

    await client.query(
      "COMMIT"
    );

    return res.status(201).json({
      success: true,
      message:
        `Version ${nextVersion} uploaded successfully`,
      version: {
        versionNumber:
          nextVersion,
        sizeBytes:
          req.file.size,
        checksum,
        createdAt:
          new Date(),
      },
      file:
        updatedFile.rows[0],
    });
  } catch (error) {
    await client
      .query("ROLLBACK")
      .catch(() => {});

    if (
      req.file?.path
    ) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}
    }

    console.error(
      "Upload new version error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to upload new file version",
      },
    });
  } finally {
    client.release();
  }
};

/* =========================================================
   GET FILE VERSIONS
========================================================= */

const getFileVersions = async (
  req,
  res
) => {
  try {
    const userId =
      req.user.userId;

    const { id } =
      req.params;

    const {
      page,
      limit,
      offset,
    } = getPagination(req);

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    const countResult =
      await pool.query(
        `SELECT
           COUNT(*)::int AS total
         FROM file_versions
         WHERE file_id = $1`,
        [id]
      );

    const total =
      countResult.rows[0]
        .total;

    const totalPages =
      Math.ceil(
        total / limit
      );

    const result =
      await pool.query(
        `SELECT
           id,
           file_id,
           version_number,
           size_bytes,
           checksum,
           created_at
         FROM file_versions
         WHERE file_id = $1
         ORDER BY
           version_number DESC
         LIMIT $2
         OFFSET $3`,
        [
          id,
          limit,
          offset,
        ]
      );

    return res.status(200).json({
      success: true,
      versions:
        result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage:
          page < totalPages,
        hasPreviousPage:
          page > 1,
      },
    });
  } catch (error) {
    console.error(
      "Get file versions error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to fetch file versions",
      },
    });
  }
};

const downloadFileVersion =
  async (req, res) => {
    try {
      const userId =
        req.user.userId;

      const {
        id,
        versionId,
      } = req.params;

      const permission =
        await getResourcePermission(
          userId,
          "file",
          id
        );

      if (!permission) {
        return res.status(404).json({
          error: {
            code:
              "FILE_NOT_FOUND",
            message:
              "File not found",
          },
        });
      }

      const result =
        await pool.query(
          `SELECT
             fv.version_number,
             fv.storage_key,
             f.name,
             f.mime_type
           FROM file_versions fv
           JOIN files f
             ON f.id = fv.file_id
           WHERE fv.id = $1
             AND fv.file_id = $2`,
          [
            versionId,
            id,
          ]
        );

      if (
        result.rows.length ===
        0
      ) {
        return res.status(404).json({
          error: {
            code:
              "VERSION_NOT_FOUND",
            message:
              "File version not found",
          },
        });
      }

      const version =
        result.rows[0];

      const filePath =
        path.join(
          uploadsDir,
          version.storage_key
        );

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        return res.status(404).json({
          error: {
            code:
              "STORAGE_FILE_NOT_FOUND",
            message:
              "Stored version file not found",
          },
        });
      }

      return res.download(
        filePath,
        version.name
      );
    } catch (error) {
      console.error(
        "Download file version error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to download file version",
        },
      });
    }
  };

const restoreFileVersion =
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const userId =
        req.user.userId;

      const {
        id,
        versionId,
      } = req.params;

      const permission =
        await getResourcePermission(
          userId,
          "file",
          id
        );

      if (!permission) {
        return res.status(404).json({
          error: {
            code:
              "FILE_NOT_FOUND",
            message:
              "File not found",
          },
        });
      }

      if (
        permission.role !==
          "owner" &&
        permission.role !==
          "editor"
      ) {
        return res.status(403).json({
          error: {
            code:
              "FORBIDDEN",
            message:
              "You only have viewer permission for this file",
          },
        });
      }

      const versionResult =
        await client.query(
          `SELECT
             fv.id,
             fv.version_number,
             fv.storage_key,
             fv.size_bytes,
             f.name,
             f.mime_type
           FROM file_versions fv
           JOIN files f
             ON f.id = fv.file_id
           WHERE fv.id = $1
             AND fv.file_id = $2
             AND f.is_deleted = FALSE`,
          [
            versionId,
            id,
          ]
        );

      if (
        versionResult.rows
          .length === 0
      ) {
        return res.status(404).json({
          error: {
            code:
              "VERSION_NOT_FOUND",
            message:
              "File version not found",
          },
        });
      }

      const version =
        versionResult.rows[0];

      const versionPath =
        path.join(
          uploadsDir,
          version.storage_key
        );

      if (
        !fs.existsSync(
          versionPath
        )
      ) {
        return res.status(404).json({
          error: {
            code:
              "STORAGE_FILE_NOT_FOUND",
            message:
              "Stored version file not found",
          },
        });
      }

      await client.query(
        "BEGIN"
      );

      const currentResult =
        await client.query(
          `SELECT
             storage_key,
             size_bytes
           FROM files
           WHERE id = $1
             AND is_deleted = FALSE`,
          [id]
        );

      const current =
        currentResult.rows[0];

      const currentVersionResult =
        await client.query(
          `SELECT id
           FROM file_versions
           WHERE file_id = $1
             AND storage_key = $2
           LIMIT 1`,
          [
            id,
            current.storage_key,
          ]
        );

      if (
        currentVersionResult
          .rows.length === 0
      ) {
        const maxResult =
          await client.query(
            `SELECT
               COALESCE(
                 MAX(version_number),
                 0
               )::int AS max_version
             FROM file_versions
             WHERE file_id = $1`,
            [id]
          );

        const newVersionNumber =
          maxResult.rows[0]
            .max_version + 1;

        let currentChecksum =
          null;

        const currentPath =
          path.join(
            uploadsDir,
            current.storage_key
          );

        if (
          fs.existsSync(
            currentPath
          )
        ) {
          try {
            currentChecksum =
              await calculateChecksum(
                currentPath
              );
          } catch {}
        }

        await client.query(
          `INSERT INTO file_versions
           (
             file_id,
             version_number,
             storage_key,
             size_bytes,
             checksum
           )
           VALUES
           ($1, $2, $3, $4, $5)`,
          [
            id,
            newVersionNumber,
            current.storage_key,
            current.size_bytes,
            currentChecksum,
          ]
        );
      }

      const updatedFile =
        await client.query(
          `UPDATE files
           SET storage_key = $1,
               size_bytes = $2,
               updated_at = NOW()
           WHERE id = $3
             AND is_deleted = FALSE
           RETURNING
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at`,
          [
            version.storage_key,
            version.size_bytes,
            id,
          ]
        );

      await client.query(
        "COMMIT"
      );

      return res.status(200).json({
        success: true,
        message:
          `Version ${version.version_number} restored successfully`,
        file:
          updatedFile.rows[0],
      });
    } catch (error) {
      await client
        .query("ROLLBACK")
        .catch(() => {});

      console.error(
        "Restore file version error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to restore file version",
        },
      });
    } finally {
      client.release();
    }
  };

/* =========================================================
   GET TRASH
========================================================= */

const getTrash = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const {
      page,
      limit,
      offset,
    } = getPagination(req);

    const fileCountResult =
      await pool.query(
        `SELECT
           COUNT(*)::int AS total
         FROM files
         WHERE owner_id = $1
           AND is_deleted = TRUE`,
        [ownerId]
      );

    const folderCountResult =
      await pool.query(
        `SELECT
           COUNT(*)::int AS total
         FROM folders
         WHERE owner_id = $1
           AND is_deleted = TRUE`,
        [ownerId]
      );

    const fileTotal =
      fileCountResult.rows[0]
        .total;

    const folderTotal =
      folderCountResult.rows[0]
        .total;

    const files =
      await pool.query(
        `SELECT
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at
         FROM files
         WHERE owner_id = $1
           AND is_deleted = TRUE
         ORDER BY
           updated_at DESC,
           id DESC
         LIMIT $2
         OFFSET $3`,
        [
          ownerId,
          limit,
          offset,
        ]
      );

    const folders =
      await pool.query(
        `SELECT
           id,
           name,
           owner_id,
           parent_id,
           created_at,
           updated_at
         FROM folders
         WHERE owner_id = $1
           AND is_deleted = TRUE
         ORDER BY
           updated_at DESC,
           id DESC
         LIMIT $2
         OFFSET $3`,
        [
          ownerId,
          limit,
          offset,
        ]
      );

    const fileTotalPages =
      Math.ceil(
        fileTotal / limit
      );

    const folderTotalPages =
      Math.ceil(
        folderTotal / limit
      );

    return res.status(200).json({
      success: true,
      trash: {
        files:
          files.rows,
        folders:
          folders.rows,
      },
      pagination: {
        page,
        limit,
        files: {
          total:
            fileTotal,
          totalPages:
            fileTotalPages,
          hasNextPage:
            page <
            fileTotalPages,
          hasPreviousPage:
            page > 1,
        },
        folders: {
          total:
            folderTotal,
          totalPages:
            folderTotalPages,
          hasNextPage:
            page <
            folderTotalPages,
          hasPreviousPage:
            page > 1,
        },
      },
    });
  } catch (error) {
    console.error(
      "Get trash error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to fetch trash",
      },
    });
  }
};

/* =========================================================
   RESTORE FILE
========================================================= */

const restoreFile = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const { id } =
      req.params;

    const result =
      await pool.query(
        `UPDATE files
         SET is_deleted = FALSE,
             updated_at = NOW()
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = TRUE
         RETURNING
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at`,
        [
          id,
          ownerId,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_IN_TRASH",
          message:
            "Deleted file not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "File restored successfully",
      file:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Restore file error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to restore file",
      },
    });
  }
};

/* =========================================================
   RESTORE FOLDER
========================================================= */

const restoreFolder = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const { id } =
      req.params;

    const folderResult =
      await pool.query(
        `SELECT
           id,
           name,
           owner_id,
           parent_id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = TRUE`,
        [
          id,
          ownerId,
        ]
      );

    if (
      folderResult.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FOLDER_NOT_IN_TRASH",
          message:
            "Deleted folder not found",
        },
      });
    }

    const folder =
      folderResult.rows[0];

    let parentId =
      folder.parent_id;

    if (parentId) {
      const parentResult =
        await pool.query(
          `SELECT id
           FROM folders
           WHERE id = $1
             AND owner_id = $2
             AND is_deleted = FALSE`,
          [
            parentId,
            ownerId,
          ]
        );

      if (
        parentResult.rows
          .length === 0
      ) {
        parentId = null;
      }
    }

    const result =
      await pool.query(
        `UPDATE folders
         SET is_deleted = FALSE,
             parent_id = $1,
             updated_at = NOW()
         WHERE id = $2
           AND owner_id = $3
           AND is_deleted = TRUE
         RETURNING
           id,
           name,
           owner_id,
           parent_id,
           is_deleted,
           created_at,
           updated_at`,
        [
          parentId,
          id,
          ownerId,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FOLDER_NOT_IN_TRASH",
          message:
            "Deleted folder not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Folder restored successfully",
      folder:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Restore folder error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to restore folder",
      },
    });
  }
};

/* =========================================================
   SEARCH FILES AND FOLDERS
========================================================= */

const searchFilesAndFolders =
  async (req, res) => {
    try {
      const ownerId =
        req.user.userId;

      const queryParams =
        req.validatedQuery ||
        req.query ||
        {};

      const q =
        queryParams.q || "";

      const {
        page,
        limit,
        offset,
      } = getPagination(req);

      const query =
        q.trim();

      if (!query) {
        return res.status(200).json({
          success: true,
          files: [],
          folders: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage:
              page > 1,
          },
        });
      }

      const searchTerm =
        `%${query}%`;

      const fileCountResult =
        await pool.query(
          `SELECT
             COUNT(*)::int AS total
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2`,
          [
            ownerId,
            searchTerm,
          ]
        );

      const folderCountResult =
        await pool.query(
          `SELECT
             COUNT(*)::int AS total
           FROM folders
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2`,
          [
            ownerId,
            searchTerm,
          ]
        );

      const fileTotal =
        fileCountResult.rows[0]
          .total;

      const folderTotal =
        folderCountResult.rows[0]
          .total;

      const files =
        await pool.query(
          `SELECT
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2
           ORDER BY
             name ASC,
             id ASC
           LIMIT $3
           OFFSET $4`,
          [
            ownerId,
            searchTerm,
            limit,
            offset,
          ]
        );

      const folders =
        await pool.query(
          `SELECT
             id,
             name,
             owner_id,
             parent_id,
             is_deleted,
             created_at,
             updated_at
           FROM folders
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2
           ORDER BY
             name ASC,
             id ASC
           LIMIT $3
           OFFSET $4`,
          [
            ownerId,
            searchTerm,
            limit,
            offset,
          ]
        );

      const fileTotalPages =
        Math.ceil(
          fileTotal / limit
        );

      const folderTotalPages =
        Math.ceil(
          folderTotal / limit
        );

      return res.status(200).json({
        success: true,
        query,
        files:
          files.rows,
        folders:
          folders.rows,
        pagination: {
          page,
          limit,
          files: {
            total:
              fileTotal,
            totalPages:
              fileTotalPages,
            hasNextPage:
              page <
              fileTotalPages,
            hasPreviousPage:
              page > 1,
          },
          folders: {
            total:
              folderTotal,
            totalPages:
              folderTotalPages,
            hasNextPage:
              page <
              folderTotalPages,
            hasPreviousPage:
              page > 1,
          },
        },
      });
    } catch (error) {
      console.error(
        "Search error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to search files and folders",
        },
      });
    }
  };

/* =========================================================
   GET RECENT FILES
========================================================= */

const getRecentFiles =
  async (req, res) => {
    try {
      const ownerId =
        req.user.userId;

      const {
        page,
        limit,
        offset,
      } = getPagination(req);

      const countResult =
        await pool.query(
          `SELECT
             COUNT(*)::int AS total
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE`,
          [ownerId]
        );

      const total =
        countResult.rows[0]
          .total;

      const totalPages =
        Math.ceil(
          total / limit
        );

      const result =
        await pool.query(
          `SELECT
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE
           ORDER BY
             updated_at DESC,
             id DESC
           LIMIT $2
           OFFSET $3`,
          [
            ownerId,
            limit,
            offset,
          ]
        );

      return res.status(200).json({
        success: true,
        files:
          result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage:
            page < totalPages,
          hasPreviousPage:
            page > 1,
        },
      });
    } catch (error) {
      console.error(
        "Get recent files error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to fetch recent files",
        },
      });
    }
  };

module.exports = {
  uploadFile,
  getFiles,
  getStorageStats,
  searchFilesAndFolders,
  renameFile,
  moveFile,
  downloadFile,
  deleteFile,
  getTrash,
  restoreFile,
  restoreFolder,
  uploadNewVersion,
  getFileVersions,
  downloadFileVersion,
  restoreFileVersion,
  getRecentFiles,
};