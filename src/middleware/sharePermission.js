const { pool } = require("../config/database");

/*
 * Get the user's permission for a resource.
 *
 * Returns:
 * {
 *   hasAccess: true,
 *   role: "owner" | "viewer" | "editor"
 * }
 */

const getResourcePermission = async (
  userId,
  resourceType,
  resourceId
) => {
  if (!userId || !resourceType || !resourceId) {
    return null;
  }

  try {
    /* =====================================================
       FILE
    ===================================================== */

    if (resourceType === "file") {
      const result = await pool.query(
        `SELECT
           f.owner_id,
           COALESCE(s.role, NULL) AS shared_role
         FROM files f
         LEFT JOIN shares s
           ON s.resource_type = 'file'
          AND s.resource_id = f.id
          AND s.grantee_user_id = $2
         WHERE f.id = $1
           AND f.is_deleted = FALSE`,
        [resourceId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const file = result.rows[0];

      if (file.owner_id === userId) {
        return {
          hasAccess: true,
          role: "owner",
        };
      }

      if (file.shared_role) {
        return {
          hasAccess: true,
          role: file.shared_role,
        };
      }

      /*
       * Check whether the file is inside
       * a folder shared with this user.
       */
      const folderResult = await pool.query(
        `SELECT s.role
         FROM files f
         JOIN folders folder
           ON folder.id = f.folder_id
         JOIN shares s
           ON s.resource_type = 'folder'
          AND s.resource_id = folder.id
          AND s.grantee_user_id = $2
         WHERE f.id = $1
           AND f.is_deleted = FALSE
           AND folder.is_deleted = FALSE`,
        [resourceId, userId]
      );

      if (folderResult.rows.length > 0) {
        return {
          hasAccess: true,
          role: folderResult.rows[0].role,
        };
      }

      return null;
    }

    /* =====================================================
       FOLDER
    ===================================================== */

    if (resourceType === "folder") {
      const result = await pool.query(
        `SELECT
           f.owner_id,
           s.role AS shared_role
         FROM folders f
         LEFT JOIN shares s
           ON s.resource_type = 'folder'
          AND s.resource_id = f.id
          AND s.grantee_user_id = $2
         WHERE f.id = $1
           AND f.is_deleted = FALSE`,
        [resourceId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const folder = result.rows[0];

      /*
       * Owner gets full access.
       */
      if (folder.owner_id === userId) {
        return {
          hasAccess: true,
          role: "owner",
        };
      }

      /*
       * Direct share.
       */
      if (folder.shared_role) {
        return {
          hasAccess: true,
          role: folder.shared_role,
        };
      }

      return null;
    }

    return null;
  } catch (error) {
    console.error(
      "getResourcePermission database error:",
      error
    );

    /*
     * Return null instead of throwing.
     * This prevents the middleware from producing
     * a misleading 500 when permission cannot be found.
     */
    return null;
  }
};

/* =========================================================
   EDITOR ACCESS
========================================================= */

const requireEditorAccess = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const resourceId = req.params.id;

      if (!resourceId) {
        return res.status(400).json({
          error: {
            code: "RESOURCE_ID_REQUIRED",
            message: "Resource ID is required",
          },
        });
      }

      const permission = await getResourcePermission(
        userId,
        resourceType,
        resourceId
      );

      if (!permission) {
        return res.status(404).json({
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "Resource not found",
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
              "You only have viewer permission for this resource",
          },
        });
      }

      req.resourcePermission = permission;

      next();
    } catch (error) {
      console.error(
        "Editor permission check error:",
        error
      );

      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message:
            "Unable to verify resource permission",
        },
      });
    }
  };
};

/* =========================================================
   SHARED ACCESS
   Viewer OR Editor
========================================================= */

const requireSharedAccess = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const resourceId = req.params.id;

      if (!resourceId) {
        return res.status(400).json({
          error: {
            code: "RESOURCE_ID_REQUIRED",
            message: "Resource ID is required",
          },
        });
      }

      const permission = await getResourcePermission(
        userId,
        resourceType,
        resourceId
      );

      if (!permission) {
        return res.status(404).json({
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "Resource not found",
          },
        });
      }

      req.resourcePermission = permission;

      next();
    } catch (error) {
      console.error(
        "Shared access check error:",
        error
      );

      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message:
            "Unable to verify resource permission",
        },
      });
    }
  };
};

module.exports = {
  getResourcePermission,
  requireEditorAccess,
  requireSharedAccess,
};