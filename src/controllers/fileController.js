const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");

const uploadsDir = path.join(__dirname, "../../uploads");

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
        `SELECT id FROM folders
         WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
        [folderId, ownerId]
      );

      if (folder.rows.length === 0) {
        fs.unlinkSync(req.file.path);

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
       (name, mime_type, size_bytes, storage_key, owner_id, folder_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, mime_type, size_bytes,
                 owner_id, folder_id, created_at, updated_at`,
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

const getFiles = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { folderId } = req.query;

    const result = await pool.query(
      `SELECT id, name, mime_type, size_bytes,
              owner_id, folder_id, created_at, updated_at
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

const getStorageStats = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const files = await pool.query(
      `SELECT
         COUNT(*)::int AS file_count,
         COALESCE(SUM(size_bytes), 0)::bigint AS storage_used
       FROM files
       WHERE owner_id = $1
       AND is_deleted = FALSE`,
      [ownerId]
    );

    const folders = await pool.query(
      `SELECT COUNT(*)::int AS folder_count
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
        storageUsed: Number(files.rows[0].storage_used),
      },
    });
  } catch (error) {
    console.error("Get storage stats error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch storage statistics",
      },
    });
  }
};

const downloadFile = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT name, storage_key, mime_type
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
    const filePath = path.join(uploadsDir, file.storage_key);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: {
          code: "STORAGE_FILE_NOT_FOUND",
          message: "Stored file not found",
        },
      });
    }

    return res.download(filePath, file.name);
  } catch (error) {
    console.error("Download file error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to download file",
      },
    });
  }
};

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
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Delete file error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to delete file",
      },
    });
  }
};

module.exports = {
  uploadFile,
  getFiles,
  getStorageStats,
  downloadFile,
  deleteFile,
};