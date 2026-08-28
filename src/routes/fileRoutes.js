const express = require("express");
const multer = require("multer");
const path = require("path");

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadFile,
  getFiles,
  downloadFile,
  deleteFile,
} = require("../controllers/fileController");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },

  filename: (req, file, cb) => {
    const uniqueName =
      `${Date.now()}-${Math.round(Math.random() * 1e9)}` +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

router.use(authMiddleware);

// Accept multipart files
router.post("/upload", upload.any(), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: {
        code: "FILE_REQUIRED",
        message: "Please select a file to upload",
      },
    });
  }

  // Make the first uploaded file available as req.file
  req.file = req.files[0];

  return uploadFile(req, res);
});

router.get("/", getFiles);

router.get("/:id/download", downloadFile);

router.delete("/:id", deleteFile);

module.exports = router;