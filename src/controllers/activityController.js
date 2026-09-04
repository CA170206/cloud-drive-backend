const { pool } = require("../config/database");

/* =========================================================
   LOG ACTIVITY
========================================================= */

const logActivity = async ({
  actorId,
  action,
  resourceType,
  resourceId,
  context = {},
}) => {
  try {
    await pool.query(
      `INSERT INTO activities
       (
         actor_id,
         action,
         resource_type,
         resource_id,
         context
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorId,
        action,
        resourceType || null,
        resourceId || null,
        context,
      ]
    );
  } catch (error) {
    console.error("Activity log error:", error);
  }
};

/* =========================================================
   GET MY ACTIVITIES
========================================================= */

const getActivities = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
         a.id,
         a.actor_id,
         a.action,
         a.resource_type,
         a.resource_id,
         a.context,
         a.created_at,
         u.name AS actor_name,
         u.email AS actor_email
       FROM activities a
       LEFT JOIN users u
         ON u.id = a.actor_id
       WHERE a.actor_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      activities: result.rows,
    });
  } catch (error) {
    console.error(
      "Get activities error:",
      error
    );

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch activities",
      },
    });
  }
};

module.exports = {
  logActivity,
  getActivities,
};