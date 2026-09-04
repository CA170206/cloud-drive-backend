/* =========================================================
   STANDARDIZED API ERROR HANDLER
========================================================= */

const errorHandler = (err, req, res, next) => {
  console.error("Unhandled API error:", err);

  /*
   * If the response has already started,
   * let Express finish the response.
   */
  if (res.headersSent) {
    return next(err);
  }

  /*
   * JSON body too large
   */
  if (
    err?.type === "entity.too.large" ||
    err?.status === 413
  ) {
    return res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request payload is too large",
      },
    });
  }

  /*
   * Invalid JSON body
   */
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    err.body !== undefined
  ) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
      },
    });
  }

  /*
   * Multer errors that are not already handled
   * by the upload route.
   */
  if (err?.name === "MulterError") {
    let message = "Invalid file upload";

    if (err.code === "LIMIT_FILE_SIZE") {
      message = "File size must be 50 MB or less";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Only one file can be uploaded at a time";
    } else if (err.code === "LIMIT_PART_COUNT") {
      message = "Too many multipart fields";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field";
    }

    return res.status(400).json({
      error: {
        code: "UPLOAD_VALIDATION_ERROR",
        message,
      },
    });
  }

  /*
   * Explicit application errors.
   *
   * Controllers/middleware can throw:
   *
   * err.statusCode
   * err.code
   * err.message
   */
  const statusCode =
    Number.isInteger(err?.statusCode)
      ? err.statusCode
      : Number.isInteger(err?.status)
        ? err.status
        : 500;

  const safeStatusCode =
    statusCode >= 400 &&
    statusCode <= 599
      ? statusCode
      : 500;

  const code =
    typeof err?.code === "string" &&
    err.code.length > 0 &&
    err.code !== "ERR_HTTP_HEADERS_SENT"
      ? err.code
      : "INTERNAL_ERROR";

  const message =
    safeStatusCode >= 500
      ? "An unexpected server error occurred"
      : err?.message ||
        "Request could not be completed";

  return res.status(safeStatusCode).json({
    error: {
      code,
      message,
    },
  });
};

/* =========================================================
   ROUTE NOT FOUND
========================================================= */

const notFoundHandler = (req, res) => {
  return res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};