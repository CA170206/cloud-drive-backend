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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());

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
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};


// Add this to backend/src/server.js

const starRoutes = require("./routes/starRoutes");

app.use("/api/stars", starRoutes);


startServer();