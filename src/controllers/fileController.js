const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");
const {
  getResourcePermission,
} = require("../middleware/sharePermission");

const uploadsDir = path.join(__dirname, "../../uploads");

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
    const { folderId } = req.query;

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
       ORDER BY name ASC`,
      [ownerId, folderId || null]
    );

    return res.status(200).json({
      success: true,
      files: result.rows,
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

    /*
     * Check owner/editor/viewer permission.
     */
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

    /*
     * Viewer cannot rename.
     */
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

    /*
     * Check permission on the file.
     */
    const permission = await getResourcePermission(
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

    /*
     * Viewer cannot move files.
     */
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

    /*
     * Get the file and its owner.
     */
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

    /*
     * null means move to root.
     */
    if (folderId === null || folderId === "") {
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

    /*
     * Destination folder must exist,
     * belong to the same owner,
     * and not be deleted.
     */
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
      [folderId, file.owner_id]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "DESTINATION_FOLDER_NOT_FOUND",
          message:
            "Destination folder not found",
        },
      });
    }

    /*
     * Don't perform unnecessary move.
     */
    if (file.folder_id === folderId) {
      return res.status(400).json({
        error: {
          code: "ALREADY_IN_FOLDER",
          message:
            "File is already in this folder",
        },
      });
    }

    /*
     * Move file.
     */
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
      [folderId, id]
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
          code: "STORAGE_FILE_NOT_FOUND",
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
   EXPORTS
========================================================= */

/* =========================================================
   GET TRASH
========================================================= */

const getTrash = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const files = await pool.query(
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
       ORDER BY updated_at DESC`,
      [ownerId]
    );

    const folders = await pool.query(
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
       ORDER BY updated_at DESC`,
      [ownerId]
    );

    return res.status(200).json({
      success: true,
      trash: {
        files: files.rows,
        folders: folders.rows,
      },
    });
  } catch (error) {
    console.error("Get trash error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch trash",
      },
    });
  }
};

/* =========================================================
   RESTORE FILE
========================================================= */

const restoreFile = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
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
      [id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_IN_TRASH",
          message: "Deleted file not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "File restored successfully",
      file: result.rows[0],
    });
  } catch (error) {
    console.error("Restore file error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to restore file",
      },
    });
  }
};

/* =========================================================
   RESTORE FOLDER
========================================================= */

const restoreFolder = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { id } = req.params;

    const folderResult = await pool.query(
      `SELECT
         id,
         name,
         owner_id,
         parent_id
       FROM folders
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = TRUE`,
      [id, ownerId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_IN_TRASH",
          message: "Deleted folder not found",
        },
      });
    }

    const folder = folderResult.rows[0];

    /*
     * If the original parent was also deleted,
     * restore this folder to root instead.
     */
    let parentId = folder.parent_id;

    if (parentId) {
      const parentResult = await pool.query(
        `SELECT id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [parentId, ownerId]
      );

      if (parentResult.rows.length === 0) {
        parentId = null;
      }
    }

    const result = await pool.query(
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
      [parentId, id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_IN_TRASH",
          message: "Deleted folder not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Folder restored successfully",
      folder: result.rows[0],
    });
  } catch (error) {
    console.error("Restore folder error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to restore folder",
      },
    });
  }
};


module.exports = {
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
};