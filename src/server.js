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

const app = express();
const PORT = process.env.PORT || 5000;
const { startTrashCleanup } = require("./jobs/trashCleanup");
startTrashCleanup();
// Middleware
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

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/stars", starRoutes);
app.use("/api/activities", activityRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Cloud Drive API is running",
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(
        `🚀 Cloud Drive API running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error.message
    );

    process.exit(1);
  }
};

startServer();