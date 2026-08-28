const { pool } = require("../config/database");

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
      const parentResult = await pool.query(
        `SELECT id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [parentId, ownerId]
      );

      if (parentResult.rows.length === 0) {
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
       RETURNING id, name, owner_id, parent_id, is_deleted, created_at, updated_at`,
      [name.trim(), ownerId, parentId]
    );

    const folder = result.rows[0];

    await pool.query(
      `INSERT INTO activities
       (actor_id, action, resource_type, resource_id, context)
       VALUES ($1, 'upload', 'folder', $2, $3)`,
      [
        ownerId,
        folder.id,
        JSON.stringify({
          name: folder.name,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      folder,
    });
  } catch (error) {
    console.error("Create folder error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: "FOLDER_EXISTS",
          message: "A folder with this name already exists here",
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to create folder",
      },
    });
  }
};

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
       RETURNING id, name, owner_id, parent_id, is_deleted, created_at, updated_at`,
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

    const folder = result.rows[0];

    await pool.query(
      `INSERT INTO activities
       (actor_id, action, resource_type, resource_id, context)
       VALUES ($1, 'rename', 'folder', $2, $3)`,
      [
        ownerId,
        folder.id,
        JSON.stringify({
          newName: folder.name,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      folder,
    });
  } catch (error) {
    console.error("Rename folder error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: "FOLDER_EXISTS",
          message: "A folder with this name already exists here",
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to rename folder",
      },
    });
  }
};

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

    const folder = result.rows[0];

    await pool.query(
      `INSERT INTO activities
       (actor_id, action, resource_type, resource_id, context)
       VALUES ($1, 'delete', 'folder', $2, $3)`,
      [
        ownerId,
        folder.id,
        JSON.stringify({
          name: folder.name,
        }),
      ]
    );

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
  deleteFolder,
};