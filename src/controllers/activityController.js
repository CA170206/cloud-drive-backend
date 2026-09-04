const { pool } = require("../config/database");

/* =========================================================
   PAGINATION HELPER
========================================================= */

const getPagination = (req) => {
  const rawPage = req.query.page;
  const rawLimit = req.query.limit;

  const page = Math.max(
    1,
    Number.parseInt(rawPage || "1", 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(rawLimit || "20", 10) || 20
    )
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

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
    const { page, limit, offset } = getPagination(req);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM activities
       WHERE actor_id = $1`,
      [userId]
    );

    const total = countResult.rows[0].total;

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
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $2
       OFFSET $3`,
      [userId, limit, offset]
    );

    return res.status(200).json({
      success: true,
      activities: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get activities error:", error);

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