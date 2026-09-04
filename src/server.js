require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const {
  connectDatabase,
} = require("./config/database");

const {
  startTrashCleanup,
} = require("./jobs/trashCleanup");

const {
  generalLimiter,
} = require("./middleware/rateLimiter");

const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");
const folderRoutes = require("./routes/folderRoutes");
const shareRoutes = require("./routes/shareRoutes");
const starRoutes = require("./routes/starRoutes");
const activityRoutes = require("./routes/activityRoutes");

const app = express();

const PORT =
  process.env.PORT || 5000;

/* =========================================================
   SECURITY HEADERS
========================================================= */

app.use(
  helmet()
);

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/* =========================================================
   BODY PARSING
========================================================= */

app.use(
  express.json({
    limit: "1mb",
  })
);

/* =========================================================
   REQUEST LOGGING
========================================================= */

app.use(
  morgan("dev")
);

/* =========================================================
   COOKIE PARSER
========================================================= */

app.use(
  cookieParser()
);

/* =========================================================
   GENERAL API RATE LIMIT
========================================================= */

app.use(
  "/api",
  generalLimiter
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {
    return res.status(200).json({
      success: true,
      status: "ok",
      message: "Cloud Drive API is running",
    });
  }
);

/* =========================================================
   API ROUTES
========================================================= */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/files",
  fileRoutes
);

app.use(
  "/api/folders",
  folderRoutes
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
   API 404 HANDLER
========================================================= */

app.use(
  "/api",
  notFoundHandler
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  errorHandler
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
          `Server running on port ${PORT}`
        );
      }
    );

    startTrashCleanup();
  } catch (error) {
    console.error(
      "Failed to start server:",
      error
    );

    process.exit(1);
  }
};

startServer();