const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");

const uploadsDir = path.join(__dirname, "../../uploads");

/* =========================================================
   CREATE / UPDATE SHARE
========================================================= */

const createShare = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const {
      resourceType,
      resourceId,
      email,
      role = "viewer",
    } = req.body;

    if (!resourceType || !resourceId || !email) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Resource type, resource ID and email are required",
        },
      });
    }

    if (!["file", "folder"].includes(resourceType)) {
      return res.status(400).json({
        error: {
          code: "INVALID_RESOURCE_TYPE",
          message:
            "Resource type must be file or folder",
        },
      });
    }

    if (!["viewer", "editor"].includes(role)) {
      return res.status(400).json({
        error: {
          code: "INVALID_ROLE",
          message:
            "Role must be viewer or editor",
        },
      });
    }

    const userResult = await pool.query(
      `SELECT id, email, name
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "USER_NOT_FOUND",
          message:
            "No user found with that email",
        },
      });
    }

    const grantee = userResult.rows[0];

    if (grantee.id === ownerId) {
      return res.status(400).json({
        error: {
          code: "CANNOT_SHARE_WITH_SELF",
          message:
            "You cannot share a resource with yourself",
        },
      });
    }

    let resource;

    if (resourceType === "file") {
      resource = await pool.query(
        `SELECT id, name
         FROM files
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [resourceId, ownerId]
      );
    } else {
      resource = await pool.query(
        `SELECT id, name
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [resourceId, ownerId]
      );
    }

    if (resource.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: `${resourceType} not found`,
        },
      });
    }

    const existingShare = await pool.query(
      `SELECT id
       FROM shares
       WHERE resource_type = $1
         AND resource_id = $2
         AND grantee_user_id = $3`,
      [resourceType, resourceId, grantee.id]
    );

    if (existingShare.rows.length > 0) {
      const updated = await pool.query(
        `UPDATE shares
         SET role = $1
         WHERE id = $2
         RETURNING id,
                   resource_type,
                   resource_id,
                   grantee_user_id,
                   role,
                   created_at`,
        [
          role,
          existingShare.rows[0].id,
        ]
      );

      return res.status(200).json({
        success: true,
        message: "Share permission updated",
        share: {
          ...updated.rows[0],
          email: grantee.email,
          name: grantee.name,
          resource_name:
            resource.rows[0].name,
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO shares
       (
         resource_type,
         resource_id,
         grantee_user_id,
         role,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id,
                 resource_type,
                 resource_id,
                 grantee_user_id,
                 role,
                 created_at`,
      [
        resourceType,
        resourceId,
        grantee.id,
        role,
        ownerId,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        "Resource shared successfully",
      share: {
        ...result.rows[0],
        email: grantee.email,
        name: grantee.name,
        resource_name:
          resource.rows[0].name,
      },
    });
  } catch (error) {
    console.error(
      "Create share error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to share resource",
      },
    });
  }
};

/* =========================================================
   GET SHARES FOR A RESOURCE
========================================================= */

const getResourceShares = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const {
      resourceType,
      resourceId,
    } = req.query;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Resource type and resource ID are required",
        },
      });
    }

    if (!["file", "folder"].includes(resourceType)) {
      return res.status(400).json({
        error: {
          code: "INVALID_RESOURCE_TYPE",
          message:
            "Resource type must be file or folder",
        },
      });
    }

    const resourceResult = await pool.query(
      resourceType === "file"
        ? `SELECT id
           FROM files
           WHERE id = $1
             AND owner_id = $2
             AND is_deleted = FALSE`
        : `SELECT id
           FROM folders
           WHERE id = $1
             AND owner_id = $2
             AND is_deleted = FALSE`,
      [resourceId, ownerId]
    );

    if (resourceResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "RESOURCE_NOT_FOUND",
          message:
            "Resource not found",
        },
      });
    }

    const result = await pool.query(
      `SELECT
         s.id,
         s.resource_type,
         s.resource_id,
         s.grantee_user_id,
         s.role,
         s.created_at,
         u.email,
         u.name
       FROM shares s
       JOIN users u
         ON u.id = s.grantee_user_id
       WHERE s.resource_type = $1
         AND s.resource_id = $2
       ORDER BY s.created_at ASC`,
      [resourceType, resourceId]
    );

    return res.status(200).json({
      success: true,
      shares: result.rows,
    });
  } catch (error) {
    console.error(
      "Get shares error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to fetch shares",
      },
    });
  }
};

/* =========================================================
   GET SHARED WITH ME
========================================================= */

const getSharedWithMe = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
         s.id AS share_id,
         s.resource_type,
         s.resource_id,
         s.role,
         s.created_at AS shared_at,

         CASE
           WHEN s.resource_type = 'file'
             THEN f.name
           WHEN s.resource_type = 'folder'
             THEN fo.name
         END AS resource_name,

         CASE
           WHEN s.resource_type = 'file'
             THEN f.mime_type
           ELSE NULL
         END AS mime_type,

         CASE
           WHEN s.resource_type = 'file'
             THEN f.size_bytes
           ELSE NULL
         END AS size_bytes,

         CASE
           WHEN s.resource_type = 'file'
             THEN f.folder_id
           WHEN s.resource_type = 'folder'
             THEN fo.parent_id
         END AS parent_id,

         u.id AS owner_id,
         u.name AS owner_name,
         u.email AS owner_email

       FROM shares s

       JOIN users u
         ON u.id = s.created_by

       LEFT JOIN files f
         ON s.resource_type = 'file'
        AND f.id = s.resource_id
        AND f.is_deleted = FALSE

       LEFT JOIN folders fo
         ON s.resource_type = 'folder'
        AND fo.id = s.resource_id
        AND fo.is_deleted = FALSE

       WHERE s.grantee_user_id = $1

       AND (
         (
           s.resource_type = 'file'
           AND f.id IS NOT NULL
         )
         OR
         (
           s.resource_type = 'folder'
           AND fo.id IS NOT NULL
         )
       )

       ORDER BY s.created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      shared: result.rows,
    });
  } catch (error) {
    console.error(
      "Get shared with me error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to fetch shared resources",
      },
    });
  }
};

/* =========================================================
   SHARED FOLDER CONTENTS
========================================================= */

const getSharedFolderContents = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const access = await pool.query(
      `SELECT
         s.id,
         s.role,
         f.id AS folder_id,
         f.name AS folder_name,
         f.owner_id
       FROM shares s
       JOIN folders f
         ON f.id = s.resource_id
       WHERE s.resource_type = 'folder'
         AND s.resource_id = $1
         AND s.grantee_user_id = $2
         AND f.is_deleted = FALSE`,
      [id, userId]
    );

    if (access.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "SHARED_FOLDER_NOT_FOUND",
          message:
            "Shared folder not found",
        },
      });
    }

    const sharedFolder = access.rows[0];

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
         AND parent_id = $2
         AND is_deleted = FALSE
       ORDER BY name ASC`,
      [
        sharedFolder.owner_id,
        sharedFolder.folder_id,
      ]
    );

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
         AND folder_id = $2
         AND is_deleted = FALSE
       ORDER BY name ASC`,
      [
        sharedFolder.owner_id,
        sharedFolder.folder_id,
      ]
    );

    return res.status(200).json({
      success: true,

      folder: {
        id: sharedFolder.folder_id,
        name: sharedFolder.folder_name,
        role: sharedFolder.role,
        ownerId: sharedFolder.owner_id,
      },

      folders: folders.rows,
      files: files.rows,
    });
  } catch (error) {
    console.error(
      "Get shared folder contents error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to fetch shared folder contents",
      },
    });
  }
};

/* =========================================================
   DOWNLOAD SHARED FILE
   Viewer + Editor
========================================================= */

const downloadSharedFile = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         f.name,
         f.storage_key,
         f.mime_type
       FROM files f
       INNER JOIN shares s
         ON s.resource_type = 'file'
        AND s.resource_id = f.id
       WHERE f.id = $1
         AND f.is_deleted = FALSE
         AND s.grantee_user_id = $2

       UNION

       SELECT
         f.name,
         f.storage_key,
         f.mime_type
       FROM files f
       INNER JOIN folders sf
         ON sf.id = f.folder_id
       INNER JOIN shares s
         ON s.resource_type = 'folder'
        AND s.resource_id = sf.id
       WHERE f.id = $1
         AND f.is_deleted = FALSE
         AND sf.is_deleted = FALSE
         AND s.grantee_user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "SHARED_FILE_NOT_FOUND",
          message:
            "Shared file not found",
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
      "Download shared file error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to download shared file",
      },
    });
  }
};

/* =========================================================
   CHECK SHARED RESOURCE PERMISSION

   Returns:
   {
     hasAccess: true/false,
     role: viewer/editor,
     resourceType: file/folder
   }

   Editor permission is accepted when:
   1. User has a direct editor share on the file/folder
   2. User has an editor share on the parent folder
========================================================= */

const getSharedPermission = async (
  userId,
  resourceType,
  resourceId
) => {
  if (
    !userId ||
    !resourceType ||
    !resourceId
  ) {
    return null;
  }

  if (resourceType === "file") {
    const directFileShare =
      await pool.query(
        `SELECT
           s.role,
           s.resource_type,
           s.resource_id
         FROM shares s
         JOIN files f
           ON f.id = s.resource_id
         WHERE s.resource_type = 'file'
           AND s.resource_id = $1
           AND s.grantee_user_id = $2
           AND f.is_deleted = FALSE`,
        [resourceId, userId]
      );

    if (
      directFileShare.rows.length > 0
    ) {
      return {
        hasAccess: true,
        role:
          directFileShare.rows[0].role,
        resourceType: "file",
        resourceId,
      };
    }

    /*
     * Check whether the file is inside
     * a folder shared with this user.
     */
    const folderShare =
      await pool.query(
        `SELECT
           s.role,
           f.folder_id
         FROM files f
         JOIN shares s
           ON s.resource_type = 'folder'
          AND s.resource_id = f.folder_id
         JOIN folders folder
           ON folder.id = f.folder_id
         WHERE f.id = $1
           AND f.is_deleted = FALSE
           AND folder.is_deleted = FALSE
           AND s.grantee_user_id = $2`,
        [resourceId, userId]
      );

    if (folderShare.rows.length > 0) {
      return {
        hasAccess: true,
        role: folderShare.rows[0].role,
        resourceType: "file",
        resourceId,
      };
    }

    return null;
  }

  if (resourceType === "folder") {
    const folderShare =
      await pool.query(
        `SELECT
           s.role
         FROM shares s
         JOIN folders f
           ON f.id = s.resource_id
         WHERE s.resource_type = 'folder'
           AND s.resource_id = $1
           AND s.grantee_user_id = $2
           AND f.is_deleted = FALSE`,
        [resourceId, userId]
      );

    if (
      folderShare.rows.length > 0
    ) {
      return {
        hasAccess: true,
        role: folderShare.rows[0].role,
        resourceType: "folder",
        resourceId,
      };
    }
  }

  return null;
};

/* =========================================================
   PERMISSION CHECK ENDPOINT

   Useful for frontend and future editor operations.
========================================================= */

const checkPermission = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const {
      resourceType,
      resourceId,
    } = req.query;

    if (
      !resourceType ||
      !resourceId
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Resource type and resource ID are required",
        },
      });
    }

    if (
      !["file", "folder"].includes(
        resourceType
      )
    ) {
      return res.status(400).json({
        error: {
          code: "INVALID_RESOURCE_TYPE",
          message:
            "Resource type must be file or folder",
        },
      });
    }

    const permission =
      await getSharedPermission(
        userId,
        resourceType,
        resourceId
      );

    return res.status(200).json({
      success: true,
      permission: permission || {
        hasAccess: false,
        role: null,
        resourceType,
        resourceId,
      },
    });
  } catch (error) {
    console.error(
      "Check permission error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to check permission",
      },
    });
  }
};

/* =========================================================
   REMOVE FROM "SHARED WITH ME"
========================================================= */

const removeSharedWithMe = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM shares
       WHERE id = $1
         AND grantee_user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "SHARE_NOT_FOUND",
          message:
            "Shared item not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Removed from Shared with me",
    });
  } catch (error) {
    console.error(
      "Remove shared item error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to remove shared item",
      },
    });
  }
};

/* =========================================================
   OWNER REMOVES SHARE
========================================================= */

const deleteShare = async (
  req,
  res
) => {
  try {
    const ownerId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM shares s
       USING (
         SELECT s.id
         FROM shares s
         WHERE s.id = $1
           AND (
             EXISTS (
               SELECT 1
               FROM files f
               WHERE s.resource_type = 'file'
                 AND f.id = s.resource_id
                 AND f.owner_id = $2
                 AND f.is_deleted = FALSE
             )
             OR EXISTS (
               SELECT 1
               FROM folders f
               WHERE s.resource_type = 'folder'
                 AND f.id = s.resource_id
                 AND f.owner_id = $2
                 AND f.is_deleted = FALSE
             )
           )
       ) allowed
       WHERE s.id = allowed.id
       RETURNING s.id`,
      [id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "SHARE_NOT_FOUND",
          message:
            "Share not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Share removed successfully",
    });
  } catch (error) {
    console.error(
      "Delete share error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Unable to remove share",
      },
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createShare,
  getResourceShares,
  getSharedWithMe,
  getSharedFolderContents,
  downloadSharedFile,
  getSharedPermission,
  checkPermission,
  removeSharedWithMe,
  deleteShare,
};