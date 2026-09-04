const { z } = require("zod");

/* =========================================================
   COMMON SCHEMAS
========================================================= */

const uuidSchema = z
  .string()
  .uuid("Invalid UUID");

const resourceTypeSchema = z.enum(
  ["file", "folder"],
  {
    error: "Resource type must be file or folder",
  }
);

const roleSchema = z.enum(
  ["viewer", "editor"],
  {
    error: "Role must be viewer or editor",
  }
);

const paginationValue = z
  .string()
  .optional()
  .default("1")
  .transform((value) => Number(value))
  .refine(
    (value) =>
      Number.isInteger(value) &&
      value >= 1,
    {
      message:
        "Value must be a positive integer",
    }
  );

const limitValue = z
  .string()
  .optional()
  .default("20")
  .transform((value) => Number(value))
  .refine(
    (value) =>
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 100,
    {
      message:
        "Limit must be between 1 and 100",
    }
  );

/* =========================================================
   AUTH
========================================================= */

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(
      100,
      "Name must be 100 characters or less"
    ),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(
      254,
      "Email must be 254 characters or less"
    ),

  password: z
    .string()
    .min(
      6,
      "Password must be at least 6 characters"
    )
    .max(
      128,
      "Password must be 128 characters or less"
    ),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(
      254,
      "Email must be 254 characters or less"
    ),

  password: z
    .string()
    .min(1, "Password is required")
    .max(
      128,
      "Password must be 128 characters or less"
    ),
});

/* =========================================================
   FOLDERS
========================================================= */

const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(
      255,
      "Folder name must be 255 characters or less"
    ),

  parentId: z
    .union([
      uuidSchema,
      z.literal(""),
      z.null(),
    ])
    .optional()
    .default(null),
});

const folderIdParamsSchema = z.object({
  id: uuidSchema,
});

const getFoldersQuerySchema = z.object({
  parentId: z
    .union([
      uuidSchema,
      z.literal(""),
    ])
    .optional(),
});

const renameFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(
      255,
      "Folder name must be 255 characters or less"
    ),
});

const moveFolderSchema = z.object({
  parentId: z
    .union([
      uuidSchema,
      z.literal(""),
      z.null(),
    ])
    .optional()
    .default(null),
});

/* =========================================================
   FILES
========================================================= */

const fileIdParamsSchema = z.object({
  id: uuidSchema,
});

const fileVersionParamsSchema = z.object({
  id: uuidSchema,
  versionId: uuidSchema,
});

const getFilesQuerySchema = z.object({
  folderId: z
    .union([
      uuidSchema,
      z.literal(""),
    ])
    .optional(),

  page: paginationValue,

  limit: limitValue,
});

const uploadFileBodySchema = z.object({
  folderId: z
    .union([
      uuidSchema,
      z.literal(""),
      z.null(),
    ])
    .optional()
    .default(null),
});

const renameFileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "File name is required")
    .max(
      255,
      "File name must be 255 characters or less"
    ),
});

const moveFileSchema = z.object({
  folderId: z
    .union([
      uuidSchema,
      z.literal(""),
      z.null(),
    ])
    .optional()
    .default(null),
});

const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(
      200,
      "Search query must be 200 characters or less"
    )
    .optional()
    .default(""),

  page: paginationValue,

  limit: limitValue,
});

/* =========================================================
   SHARES
========================================================= */

const createShareSchema = z.object({
  resourceType: resourceTypeSchema,

  resourceId: uuidSchema,

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(
      254,
      "Email must be 254 characters or less"
    ),

  role: roleSchema
    .optional()
    .default("viewer"),
});

const resourceQuerySchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: uuidSchema,
});

const sharedFolderParamsSchema = z.object({
  id: uuidSchema,
});

const sharedFileParamsSchema = z.object({
  id: uuidSchema,
});

const shareIdParamsSchema = z.object({
  id: uuidSchema,
});

const publicLinkTokenParamsSchema = z.object({
  token: z
    .string()
    .regex(
      /^[a-f0-9]{64}$/,
      "Invalid public link token"
    ),
});

const createPublicLinkSchema = z.object({
  resourceType: z.literal("file"),

  resourceId: uuidSchema,

  role: z
    .literal("viewer")
    .optional()
    .default("viewer"),

  password: z
    .string()
    .min(
      1,
      "Password cannot be empty"
    )
    .max(
      128,
      "Password must be 128 characters or less"
    )
    .optional(),

  expiresAt: z
    .string()
    .datetime({
      offset: true,
      message:
        "Expiration time must be a valid ISO date",
    })
    .optional(),
});

const publicLinkPasswordQuerySchema =
  z.object({
    password: z
      .string()
      .max(
        128,
        "Password must be 128 characters or less"
      )
      .optional(),
  });

/* =========================================================
   STARS
========================================================= */

const starBodySchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: uuidSchema,
});

const starQuerySchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: uuidSchema,
});

/* =========================================================
   ACTIVITIES
========================================================= */

const activitiesQuerySchema = z.object({
  page: paginationValue,
  limit: limitValue,
});

/* =========================================================
   VALIDATION ERROR FORMAT
========================================================= */

const formatZodError = (error) => {
  return error.issues.map((issue) => ({
    field:
      issue.path.length > 0
        ? issue.path.join(".")
        : "request",
    message: issue.message,
  }));
};

/* =========================================================
   VALIDATION MIDDLEWARE
========================================================= */

const validate = ({
  body,
  params,
  query,
} = {}) => {
  return (req, res, next) => {
    try {
      if (body) {
        const result =
          body.safeParse(
            req.body || {}
          );

        if (!result.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Invalid request data",
              details:
                formatZodError(
                  result.error
                ),
            },
          });
        }

        req.body = result.data;
      }

      if (params) {
        const result =
          params.safeParse(
            req.params || {}
          );

        if (!result.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Invalid request parameters",
              details:
                formatZodError(
                  result.error
                ),
            },
          });
        }

        req.params = result.data;
      }

      if (query) {
        const result =
          query.safeParse(
            req.query || {}
          );

        if (!result.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Invalid query parameters",
              details:
                formatZodError(
                  result.error
                ),
            },
          });
        }

        /*
         * Express 5 exposes req.query as a getter.
         * Store validated query data separately.
         */
        req.validatedQuery =
          result.data;
      }

      next();
    } catch (error) {
      console.error(
        "Validation middleware error:",
        error
      );

      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Invalid request data",
        },
      });
    }
  };
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  validate,

  uuidSchema,
  resourceTypeSchema,
  roleSchema,

  paginationValue,
  limitValue,

  registerSchema,
  loginSchema,

  createFolderSchema,
  folderIdParamsSchema,
  getFoldersQuerySchema,
  renameFolderSchema,
  moveFolderSchema,

  fileIdParamsSchema,
  fileVersionParamsSchema,
  getFilesQuerySchema,
  uploadFileBodySchema,
  renameFileSchema,
  moveFileSchema,
  searchQuerySchema,

  createShareSchema,
  resourceQuerySchema,
  sharedFolderParamsSchema,
  sharedFileParamsSchema,
  shareIdParamsSchema,
  publicLinkTokenParamsSchema,
  createPublicLinkSchema,
  publicLinkPasswordQuerySchema,

  starBodySchema,
  starQuerySchema,

  activitiesQuerySchema,
};