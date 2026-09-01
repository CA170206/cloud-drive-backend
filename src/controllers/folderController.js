const { pool } = require("../config/database");
const {
  getResourcePermission,
} = require("../middleware/sharePermission");

/* =========================================================
   CREATE FOLDER
========================================================= */

const createFolder = async (req, res) => {
  try {
    const { name, parentId = null } = req.body;
    const ownerId = req.user.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Folder name is required",
        },
      });
    }

    if (parentId) {
      const parent = await pool.query(
        `SELECT id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [parentId, ownerId]
      );

      if (parent.rows.length === 0) {
        return res.status(404).json({
          error: {
            code: "PARENT_NOT_FOUND",
            message: "Parent folder not found",
          },
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO folders (name, owner_id, parent_id)
       VALUES ($1, $2, $3)
       RETURNING
         id,
         name,
         owner_id,
         parent_id,
         is_deleted,
         created_at,
         updated_at`,
      [name.trim(), ownerId, parentId]
    );

    return res.status(201).json({
      success: true,
      folder: result.rows[0],
    });
  } catch (error) {
    console.error("Create folder error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to create folder",
      },
    });
  }
};

/* =========================================================
   GET FOLDERS
========================================================= */

const getFolders = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { parentId } = req.query;

    const result = await pool.query(
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
         AND (
           ($2::uuid IS NULL AND parent_id IS NULL)
           OR parent_id = $2::uuid
         )
       ORDER BY name ASC`,
      [ownerId, parentId || null]
    );

    return res.status(200).json({
      success: true,
      folders: result.rows,
    });
  } catch (error) {
    console.error("Get folders error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch folders",
      },
    });
  }
};

/* =========================================================
   RENAME FOLDER
========================================================= */

const renameFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const ownerId = req.user.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Folder name is required",
        },
      });
    }

    const result = await pool.query(
      `UPDATE folders
       SET name = $1,
           updated_at = NOW()
       WHERE id = $2
         AND owner_id = $3
         AND is_deleted = FALSE
       RETURNING
         id,
         name,
         owner_id,
         parent_id,
         is_deleted,
         created_at,
         updated_at`,
      [name.trim(), id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_FOUND",
          message: "Folder not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      folder: result.rows[0],
    });
  } catch (error) {
    console.error("Rename folder error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to rename folder",
      },
    });
  }
};

/* =========================================================
   MOVE FOLDER
   Owner + Editor
========================================================= */

const moveFolder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { parentId = null } = req.body;

    /*
     * Check whether current user owns/edits the folder.
     */
    const permission = await getResourcePermission(
      userId,
      "folder",
      id
    );

    if (!permission) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_FOUND",
          message: "Folder not found",
        },
      });
    }

    /*
     * Viewer cannot move folders.
     */
    if (
      permission.role !== "owner" &&
      permission.role !== "editor"
    ) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "You only have viewer permission for this folder",
        },
      });
    }

    /*
     * Get the folder.
     */
    const folderResult = await pool.query(
      `SELECT
         id,
         name,
         owner_id,
         parent_id
       FROM folders
       WHERE id = $1
         AND is_deleted = FALSE`,
      [id]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_FOUND",
          message: "Folder not found",
        },
      });
    }

    const folder = folderResult.rows[0];

    /*
     * null / empty string = move to root.
     */
    const destinationParent =
      parentId === "" ? null : parentId;

    /*
     * Already in this location.
     */
    if (
      (folder.parent_id === null &&
        destinationParent === null) ||
      folder.parent_id === destinationParent
    ) {
      return res.status(400).json({
        error: {
          code: "ALREADY_IN_FOLDER",
          message:
            "Folder is already in this location",
        },
      });
    }

    /*
     * Moving to root.
     */
    if (destinationParent === null) {
      const result = await pool.query(
        `UPDATE folders
         SET parent_id = NULL,
             updated_at = NOW()
         WHERE id = $1
           AND is_deleted = FALSE
         RETURNING
           id,
           name,
           owner_id,
           parent_id,
           is_deleted,
           created_at,
           updated_at`,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "Folder moved successfully",
        folder: result.rows[0],
      });
    }

    /*
     * Destination must belong to the same owner.
     */
    const destinationResult = await pool.query(
      `SELECT
         id,
         name,
         owner_id,
         is_deleted
       FROM folders
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [destinationParent, folder.owner_id]
    );

    if (destinationResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "DESTINATION_FOLDER_NOT_FOUND",
          message:
            "Destination folder not found",
        },
      });
    }

    /*
     * Prevent moving a folder into itself
     * or any of its descendants.
     *
     * Example:
     *
     * A
     * └── B
     *     └── C
     *
     * A → C = forbidden
     */
    const cycleCheck = await pool.query(
      `WITH RECURSIVE descendants AS (
         SELECT id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE

         UNION ALL

         SELECT f.id
         FROM folders f
         INNER JOIN descendants d
           ON f.parent_id = d.id
         WHERE f.owner_id = $2
           AND f.is_deleted = FALSE
       )
       SELECT id
       FROM descendants
       WHERE id = $3`,
      [
        id,
        folder.owner_id,
        destinationParent,
      ]
    );

    if (cycleCheck.rows.length > 0) {
      return res.status(400).json({
        error: {
          code: "FOLDER_CYCLE",
          message:
            "A folder cannot be moved into itself or one of its subfolders",
        },
      });
    }

    /*
     * Move folder.
     */
    const result = await pool.query(
      `UPDATE folders
       SET parent_id = $1,
           updated_at = NOW()
       WHERE id = $2
         AND is_deleted = FALSE
       RETURNING
         id,
         name,
         owner_id,
         parent_id,
         is_deleted,
         created_at,
         updated_at`,
      [destinationParent, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_FOUND",
          message: "Folder not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Folder moved successfully",
      folder: result.rows[0],
    });
  } catch (error) {
    console.error("Move folder error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to move folder",
      },
    });
  }
};

/* =========================================================
   DELETE FOLDER
========================================================= */

const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.userId;

    const result = await pool.query(
      `UPDATE folders
       SET is_deleted = TRUE,
           updated_at = NOW()
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE
       RETURNING id, name`,
      [id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "FOLDER_NOT_FOUND",
          message: "Folder not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Folder deleted successfully",
    });
  } catch (error) {
    console.error("Delete folder error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to delete folder",
      },
    });
  }
};

module.exports = {
  createFolder,
  getFolders,
  renameFolder,
  moveFolder,
  deleteFolder,
};