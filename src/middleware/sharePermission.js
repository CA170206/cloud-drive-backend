const { pool } = require("../config/database");

/* =========================================================
   GET RESOURCE PERMISSION
========================================================= */

/*
 * Returns:
 *
 * {
 *   role: "owner" | "editor" | "viewer",
 *   resourceType: "file" | "folder",
 *   resourceId: "uuid"
 * }
 *
 * or null when the resource exists but the user has
 * no access.
 *
 * IMPORTANT:
 * Database errors are NOT converted to null.
 * A database failure must result in a server error rather
 * than incorrectly appearing as "resource not found".
 */

const getResourcePermission = async (
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

  /* =======================================================
     FILE PERMISSION
  ======================================================= */

  if (resourceType === "file") {
    /*
     * 1. Check whether the user owns the file.
     */
    const ownerResult = await pool.query(
      `SELECT
         id,
         owner_id
       FROM files
       WHERE id = $1
         AND is_deleted = FALSE`,
      [resourceId]
    );

    if (ownerResult.rows.length === 0) {
      return null;
    }

    const file = ownerResult.rows[0];

    if (
      file.owner_id === userId
    ) {
      return {
        role: "owner",
        resourceType: "file",
        resourceId,
      };
    }

    /*
     * 2. Check direct file share.
     */
    const directFileShare =
      await pool.query(
        `SELECT
           s.role
         FROM shares s
         INNER JOIN files f
           ON f.id = s.resource_id
         WHERE s.resource_type = 'file'
           AND s.resource_id = $1
           AND s.grantee_user_id = $2
           AND f.is_deleted = FALSE
         LIMIT 1`,
        [
          resourceId,
          userId,
        ]
      );

    if (
      directFileShare.rows.length > 0
    ) {
      return {
        role:
          directFileShare.rows[0].role,
        resourceType: "file",
        resourceId,
      };
    }

    /*
     * 3. Check share inherited from the file's
     *    immediate parent folder.
     */
    const parentFolderShare =
      await pool.query(
        `SELECT
           s.role
         FROM files f
         INNER JOIN folders folder
           ON folder.id = f.folder_id
         INNER JOIN shares s
           ON s.resource_type = 'folder'
          AND s.resource_id = folder.id
         WHERE f.id = $1
           AND f.is_deleted = FALSE
           AND folder.is_deleted = FALSE
           AND s.grantee_user_id = $2
         LIMIT 1`,
        [
          resourceId,
          userId,
        ]
      );

    if (
      parentFolderShare.rows.length > 0
    ) {
      return {
        role:
          parentFolderShare.rows[0].role,
        resourceType: "file",
        resourceId,
      };
    }

    /*
     * Resource exists, but user has no access.
     */
    return null;
  }

  /* =======================================================
     FOLDER PERMISSION
  ======================================================= */

  if (resourceType === "folder") {
    /*
     * 1. Check whether the user owns the folder.
     */
    const ownerResult = await pool.query(
      `SELECT
         id,
         owner_id
       FROM folders
       WHERE id = $1
         AND is_deleted = FALSE`,
      [resourceId]
    );

    if (ownerResult.rows.length === 0) {
      return null;
    }

    const folder = ownerResult.rows[0];

    if (
      folder.owner_id === userId
    ) {
      return {
        role: "owner",
        resourceType: "folder",
        resourceId,
      };
    }

    /*
     * 2. Check direct folder share.
     */
    const folderShare =
      await pool.query(
        `SELECT
           s.role
         FROM shares s
         INNER JOIN folders f
           ON f.id = s.resource_id
         WHERE s.resource_type = 'folder'
           AND s.resource_id = $1
           AND s.grantee_user_id = $2
           AND f.is_deleted = FALSE
         LIMIT 1`,
        [
          resourceId,
          userId,
        ]
      );

    if (
      folderShare.rows.length > 0
    ) {
      return {
        role:
          folderShare.rows[0].role,
        resourceType: "folder",
        resourceId,
      };
    }

    /*
     * No access.
     */
    return null;
  }

  /*
   * Unknown resource type.
   *
   * Normally this is already blocked by Zod validation,
   * but keeping this guard makes the authorization helper
   * safe when called directly by another controller.
   */
  return null;
};

/* =========================================================
   REQUIRE EDITOR ACCESS
========================================================= */

const requireEditorAccess = (
  resourceType
) => {
  return async (req, res, next) => {
    try {
      const userId =
        req.user?.userId;

      const resourceId =
        req.params?.id;

      if (
        !userId ||
        !resourceId
      ) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message:
              "Authentication required",
          },
        });
      }

      const permission =
        await getResourcePermission(
          userId,
          resourceType,
          resourceId
        );

      /*
       * No permission.
       *
       * We intentionally return 404 instead of revealing
       * whether another user's resource exists.
       */
      if (!permission) {
        return res.status(404).json({
          error: {
            code:
              resourceType === "folder"
                ? "FOLDER_NOT_FOUND"
                : "FILE_NOT_FOUND",
            message:
              resourceType === "folder"
                ? "Folder not found"
                : "File not found",
          },
        });
      }

      /*
       * Viewer cannot perform editor operations.
       */
      if (
        permission.role !== "owner" &&
        permission.role !== "editor"
      ) {
        return res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message:
              `You only have viewer permission for this ${resourceType}`,
          },
        });
      }

      req.resourcePermission =
        permission;

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
            "Unable to verify resource permissions",
        },
      });
    }
  };
};

/* =========================================================
   REQUIRE SHARED ACCESS
========================================================= */

const requireSharedAccess = (
  resourceType
) => {
  return async (req, res, next) => {
    try {
      const userId =
        req.user?.userId;

      const resourceId =
        req.params?.id;

      if (
        !userId ||
        !resourceId
      ) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message:
              "Authentication required",
          },
        });
      }

      const permission =
        await getResourcePermission(
          userId,
          resourceType,
          resourceId
        );

      /*
       * Do not reveal whether a resource belongs to
       * another user.
       */
      if (!permission) {
        return res.status(404).json({
          error: {
            code:
              resourceType === "folder"
                ? "FOLDER_NOT_FOUND"
                : "FILE_NOT_FOUND",
            message:
              resourceType === "folder"
                ? "Folder not found"
                : "File not found",
          },
        });
      }

      req.resourcePermission =
        permission;

      next();
    } catch (error) {
      console.error(
        "Shared permission check error:",
        error
      );

      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message:
            "Unable to verify resource permissions",
        },
      });
    }
  };
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getResourcePermission,
  requireEditorAccess,
  requireSharedAccess,
};