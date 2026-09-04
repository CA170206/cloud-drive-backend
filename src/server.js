require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const { connectDatabase } = require("./config/database");

const authRoutes = require("./routes/authRoutes");
const folderRoutes = require("./routes/folderRoutes");
const fileRoutes = require("./routes/fileRoutes");
const shareRoutes = require("./routes/shareRoutes");
const starRoutes = require("./routes/starRoutes");
const activityRoutes = require("./routes/activityRoutes");

const {
  generalLimiter,
} = require("./middleware/rateLimiter");

const {
  startTrashCleanup,
} = require("./jobs/trashCleanup");

const app = express();

const PORT =
  process.env.PORT || 5000;

startTrashCleanup();

/* =========================================================
   SECURITY MIDDLEWARE
========================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/*
 * Limit JSON request size to reduce oversized request abuse.
 */
app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(morgan("dev"));
app.use(cookieParser());

/*
 * General API rate limiter.
 *
 * Specific sensitive endpoints such as authentication
 * and public-link access have stricter limiters in their
 * respective route files.
 */
app.use(
  "/api",
  generalLimiter
);

/* =========================================================
   ROUTES
========================================================= */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/folders",
  folderRoutes
);

app.use(
  "/api/files",
  fileRoutes
);

app.use(
  "/api/shares",
  shareRoutes
);

app.use(
  "/api/stars",
  starRoutes
);

app.use(
  "/api/activities",
  activityRoutes
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.status(200).json({
      success: true,
      message:
        "Cloud Drive API is running",
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

const startServer = async () => {
  try {
    await connectDatabase();

    app.listen(
      PORT,
      () => {
        console.log(
          `🚀 Cloud Drive API running on http://localhost:${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error.message
    );

    process.exit(1);
  }
};

startServer();