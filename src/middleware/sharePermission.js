const { pool } = require("../config/database");

/*
 * Get the user's permission for a resource.
 *
 * Returns:
 * {
 *   hasAccess: true,
 *   role: "viewer" | "editor"
 * }
 *
 * Owner automatically has editor-level access.
 */

const getResourcePermission = async (
  userId,
  resourceType,
  resourceId
) => {
  if (!userId || !resourceType || !resourceId) {
    return null;
  }

  /*
   * FILE
   */
  if (resourceType === "file") {
    // Owner
    const ownerResult = await pool.query(
      `SELECT id
       FROM files
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [resourceId, userId]
    );

    if (ownerResult.rows.length > 0) {
      return {
        hasAccess: true,
        role: "owner",
      };
    }

    // Direct file share
    const directShare = await pool.query(
      `SELECT s.role
       FROM shares s
       JOIN files f
         ON f.id = s.resource_id
       WHERE s.resource_type = 'file'
         AND s.resource_id = $1
         AND s.grantee_user_id = $2
         AND f.is_deleted = FALSE`,
      [resourceId, userId]
    );

    if (directShare.rows.length > 0) {
      return {
        hasAccess: true,
        role: directShare.rows[0].role,
      };
    }

    // File inside a shared folder
    const folderShare = await pool.query(
      `SELECT s.role
       FROM files f
       JOIN folders folder
         ON folder.id = f.folder_id
       JOIN shares s
         ON s.resource_type = 'folder'
        AND s.resource_id = folder.id
       WHERE f.id = $1
         AND s.grantee_user_id = $2
         AND f.is_deleted = FALSE
         AND folder.is_deleted = FALSE`,
      [resourceId, userId]
    );

    if (folderShare.rows.length > 0) {
      return {
        hasAccess: true,
        role: folderShare.rows[0].role,
      };
    }

    return null;
  }

  /*
   * FOLDER
   */
  if (resourceType === "folder") {
    // Owner
    const ownerResult = await pool.query(
      `SELECT id
       FROM folders
       WHERE id = $1
         AND owner_id = $2
         AND is_deleted = FALSE`,
      [resourceId, userId]
    );

    if (ownerResult.rows.length > 0) {
      return {
        hasAccess: true,
        role: "owner",
      };
    }

    // Direct folder share
    const shareResult = await pool.query(
      `SELECT s.role
       FROM shares s
       JOIN folders f
         ON f.id = s.resource_id
       WHERE s.resource_type = 'folder'
         AND s.resource_id = $1
         AND s.grantee_user_id = $2
         AND f.is_deleted = FALSE`,
      [resourceId, userId]
    );

    if (shareResult.rows.length > 0) {
      return {
        hasAccess: true,
        role: shareResult.rows[0].role,
      };
    }

    return null;
  }

  return null;
};

/*
 * Middleware factory.
 *
 * Usage:
 *
 * router.patch(
 *   "/:id",
 *   requireEditorAccess("file"),
 *   renameFile
 * );
 */

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

      const permission =
        await getResourcePermission(
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

      /*
       * Make permission available to the controller.
       */
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

/*
 * Viewer OR Editor access.
 *
 * Useful for operations such as preview/download.
 */

const requireSharedAccess = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const resourceId = req.params.id;

      const permission =
        await getResourcePermission(
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