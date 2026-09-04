// backend/src/controllers/starController.js

const { pool } = require("../config/database");

/* =========================================================
   STAR RESOURCE
========================================================= */

const starResource = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Resource type and resource ID are required",
        },
      });
    }

    if (!["file", "folder"].includes(resourceType)) {
      return res.status(400).json({
        error: {
          code: "INVALID_RESOURCE_TYPE",
          message: "Resource type must be file or folder",
        },
      });
    }

    const resourceResult = await pool.query(
      resourceType === "file"
        ? `SELECT id, name
           FROM files
           WHERE id = $1
             AND owner_id = $2
             AND is_deleted = FALSE`
        : `SELECT id, name
           FROM folders
           WHERE id = $1
             AND owner_id = $2
             AND is_deleted = FALSE`,
      [resourceId, userId]
    );

    if (resourceResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: `${resourceType} not found`,
        },
      });
    }

    const existing = await pool.query(
      `SELECT user_id
       FROM stars
       WHERE user_id = $1
         AND resource_type = $2
         AND resource_id = $3`,
      [userId, resourceType, resourceId]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        success: true,
        starred: true,
        message: "Resource is already starred",
      });
    }

    await pool.query(
      `INSERT INTO stars
       (user_id, resource_type, resource_id)
       VALUES ($1, $2, $3)`,
      [userId, resourceType, resourceId]
    );

    return res.status(201).json({
      success: true,
      starred: true,
      message: "Resource starred successfully",
    });
  } catch (error) {
    console.error("Star resource error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to star resource",
      },
    });
  }
};

/* =========================================================
   UNSTAR RESOURCE
========================================================= */

const unstarResource = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resourceType, resourceId } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Resource type and resource ID are required",
        },
      });
    }

    const result = await pool.query(
      `DELETE FROM stars
       WHERE user_id = $1
         AND resource_type = $2
         AND resource_id = $3
       RETURNING user_id`,
      [userId, resourceType, resourceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "STAR_NOT_FOUND",
          message: "Resource is not starred",
        },
      });
    }

    return res.status(200).json({
      success: true,
      starred: false,
      message: "Resource unstarred successfully",
    });
  } catch (error) {
    console.error("Unstar resource error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to unstar resource",
      },
    });
  }
};

/* =========================================================
   GET STARRED RESOURCES
========================================================= */

const getStarredResources = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
         s.user_id,
         s.resource_type,
         s.resource_id,

         CASE
           WHEN s.resource_type = 'file'
             THEN f.name
           WHEN s.resource_type = 'folder'
             THEN fo.name
         END AS name,

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
         END AS parent_id

       FROM stars s

       LEFT JOIN files f
         ON s.resource_type = 'file'
        AND f.id = s.resource_id
        AND f.owner_id = s.user_id
        AND f.is_deleted = FALSE

       LEFT JOIN folders fo
         ON s.resource_type = 'folder'
        AND fo.id = s.resource_id
        AND fo.owner_id = s.user_id
        AND fo.is_deleted = FALSE

       WHERE s.user_id = $1

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

       ORDER BY name ASC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      starred: result.rows,
    });
  } catch (error) {
    console.error(
      "Get starred resources error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch starred resources",
      },
    });
  }
};

/* =========================================================
   CHECK STAR STATUS
========================================================= */

const checkStarStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resourceType, resourceId } = req.query;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Resource type and resource ID are required",
        },
      });
    }

    const result = await pool.query(
      `SELECT user_id
       FROM stars
       WHERE user_id = $1
         AND resource_type = $2
         AND resource_id = $3`,
      [userId, resourceType, resourceId]
    );

    return res.status(200).json({
      success: true,
      starred: result.rows.length > 0,
    });
  } catch (error) {
    console.error("Check star status error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to check star status",
      },
    });
  }
};

module.exports = {
  starResource,
  unstarResource,
  getStarredResources,
  checkStarStatus,
};