// const fs = require("fs");
// const path = require("path");
// const crypto = require("crypto");

// const { pool } = require("../config/database");
// const {
//   getResourcePermission,
// } = require("../middleware/sharePermission");

// const uploadsDir = path.join(__dirname, "../../uploads");

// /* =========================================================
//    PAGINATION HELPER
// ========================================================= */

// const getPagination = (req) => {
//   const query = req.validatedQuery || req.query || {};

//   const rawPage = query.page;
//   const rawLimit = query.limit;

//   const page = Math.max(
//     1,
//     Number.parseInt(rawPage || "1", 10) || 1
//   );

//   const limit = Math.min(
//     100,
//     Math.max(
//       1,
//       Number.parseInt(rawLimit || "20", 10) || 20
//     )
//   );

//   return {
//     page,
//     limit,
//     offset: (page - 1) * limit,
//   };
// };

// /* =========================================================
//    UPLOAD FILE
// ========================================================= */

// const uploadFile = async (req, res) => {
//   try {
//     const ownerId = req.user.userId;
//     const { folderId = null } = req.body;

//     if (!req.file) {
//       return res.status(400).json({
//         error: {
//           code: "FILE_REQUIRED",
//           message: "Please select a file to upload",
//         },
//       });
//     }

//     if (folderId) {
//       const folder = await pool.query(
//         `SELECT id
//          FROM folders
//          WHERE id = $1
//            AND owner_id = $2
//            AND is_deleted = FALSE`,
//         [folderId, ownerId]
//       );

//       if (folder.rows.length === 0) {
//         try {
//           fs.unlinkSync(req.file.path);
//         } catch {}

//         return res.status(404).json({
//           error: {
//             code: "FOLDER_NOT_FOUND",
//             message: "Folder not found",
//           },
//         });
//       }
//     }

//     const result = await pool.query(
//       `INSERT INTO files
//        (
//          name,
//          mime_type,
//          size_bytes,
//          storage_key,
//          owner_id,
//          folder_id
//        )
//        VALUES ($1, $2, $3, $4, $5, $6)
//        RETURNING
//          id,
//          name,
//          mime_type,
//          size_bytes,
//          owner_id,
//          folder_id,
//          created_at,
//          updated_at`,
//       [
//         req.file.originalname,
//         req.file.mimetype,
//         req.file.size,
//         req.file.filename,
//         ownerId,
//         folderId,
//       ]
//     );

//     return res.status(201).json({
//       success: true,
//       file: result.rows[0],
//     });
//   } catch (error) {
//     console.error("Upload file error:", error);

//     if (req.file?.path) {
//       try {
//         fs.unlinkSync(req.file.path);
//       } catch {}
//     }

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message: "Unable to upload file",
//       },
//     });
//   }
// };

// /* =========================================================
//    GET FILES
// ========================================================= */

// const getFiles = async (req, res) => {
//   try {
//     const ownerId = req.user.userId;

//     const query = req.validatedQuery || req.query || {};

//     const folderId = query.folderId;

//     const {
//       page,
//       limit,
//       offset,
//     } = getPagination(req);

//     const countResult = await pool.query(
//       `SELECT COUNT(*)::int AS total
//        FROM files
//        WHERE owner_id = $1
//          AND is_deleted = FALSE
//          AND (
//            ($2::uuid IS NULL AND folder_id IS NULL)
//            OR folder_id = $2::uuid
//          )`,
//       [ownerId, folderId || null]
//     );

//     const total = countResult.rows[0].total;
//     const totalPages = Math.ceil(total / limit);

//     const result = await pool.query(
//       `SELECT
//          id,
//          name,
//          mime_type,
//          size_bytes,
//          owner_id,
//          folder_id,
//          created_at,
//          updated_at
//        FROM files
//        WHERE owner_id = $1
//          AND is_deleted = FALSE
//          AND (
//            ($2::uuid IS NULL AND folder_id IS NULL)
//            OR folder_id = $2::uuid
//          )
//        ORDER BY name ASC, id ASC
//        LIMIT $3
//        OFFSET $4`,
//       [
//         ownerId,
//         folderId || null,
//         limit,
//         offset,
//       ]
//     );

//     return res.status(200).json({
//       success: true,
//       files: result.rows,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages,
//         hasNextPage: page < totalPages,
//         hasPreviousPage: page > 1,
//       },
//     });
//   } catch (error) {
//     console.error("Get files error:", error);

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message: "Unable to fetch files",
//       },
//     });
//   }
// };

// /* =========================================================
//    STORAGE STATS
// ========================================================= */

// const getStorageStats = async (req, res) => {
//   try {
//     const ownerId = req.user.userId;

//     const files = await pool.query(
//       `SELECT
//          COUNT(*)::int AS file_count,
//          COALESCE(
//            SUM(size_bytes),
//            0
//          )::bigint AS storage_used
//        FROM files
//        WHERE owner_id = $1
//          AND is_deleted = FALSE`,
//       [ownerId]
//     );

//     const folders = await pool.query(
//       `SELECT
//          COUNT(*)::int AS folder_count
//        FROM folders
//        WHERE owner_id = $1
//          AND is_deleted = FALSE`,
//       [ownerId]
//     );

//     return res.status(200).json({
//       success: true,
//       stats: {
//         fileCount: files.rows[0].file_count,
//         folderCount: folders.rows[0].folder_count,
//         storageUsed: Number(
//           files.rows[0].storage_used
//         ),
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Get storage stats error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message:
//           "Unable to fetch storage statistics",
//       },
//     });
//   }
// };

// /* =========================================================
//    RENAME FILE
//    Owner + Editor
// ========================================================= */

// const renameFile = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { id } = req.params;
//     const { name } = req.body;

//     if (!name || !name.trim()) {
//       return res.status(400).json({
//         error: {
//           code: "VALIDATION_ERROR",
//           message: "File name is required",
//         },
//       });
//     }

//     const trimmedName = name.trim();

//     if (trimmedName.length > 255) {
//       return res.status(400).json({
//         error: {
//           code: "VALIDATION_ERROR",
//           message:
//             "File name must be 255 characters or less",
//         },
//       });
//     }

//     const permission =
//       await getResourcePermission(
//         userId,
//         "file",
//         id
//       );

//     if (!permission) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     if (
//       permission.role !== "owner" &&
//       permission.role !== "editor"
//     ) {
//       return res.status(403).json({
//         error: {
//           code: "FORBIDDEN",
//           message:
//             "You only have viewer permission for this file",
//         },
//       });
//     }

//     const result = await pool.query(
//       `UPDATE files
//        SET name = $1,
//            updated_at = NOW()
//        WHERE id = $2
//          AND is_deleted = FALSE
//        RETURNING
//          id,
//          name,
//          mime_type,
//          size_bytes,
//          owner_id,
//          folder_id,
//          created_at,
//          updated_at`,
//       [trimmedName, id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "File renamed successfully",
//       file: result.rows[0],
//     });
//   } catch (error) {
//     console.error(
//       "Rename file error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message:
//           "Unable to rename file",
//       },
//     });
//   }
// };

// /* =========================================================
//    MOVE FILE
//    Owner + Editor
// ========================================================= */

// const moveFile = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { id } = req.params;
//     const { folderId = null } = req.body;

//     const permission =
//       await getResourcePermission(
//         userId,
//         "file",
//         id
//       );

//     if (!permission) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     if (
//       permission.role !== "owner" &&
//       permission.role !== "editor"
//     ) {
//       return res.status(403).json({
//         error: {
//           code: "FORBIDDEN",
//           message:
//             "You only have viewer permission for this file",
//         },
//       });
//     }

//     const fileResult = await pool.query(
//       `SELECT
//          id,
//          name,
//          owner_id,
//          folder_id,
//          is_deleted
//        FROM files
//        WHERE id = $1
//          AND is_deleted = FALSE`,
//       [id]
//     );

//     if (fileResult.rows.length === 0) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     const file = fileResult.rows[0];

//     if (
//       folderId === null ||
//       folderId === ""
//     ) {
//       const result = await pool.query(
//         `UPDATE files
//          SET folder_id = NULL,
//              updated_at = NOW()
//          WHERE id = $1
//            AND is_deleted = FALSE
//          RETURNING
//            id,
//            name,
//            mime_type,
//            size_bytes,
//            owner_id,
//            folder_id,
//            created_at,
//            updated_at`,
//         [id]
//       );

//       return res.status(200).json({
//         success: true,
//         message: "File moved successfully",
//         file: result.rows[0],
//       });
//     }

//     const folderResult = await pool.query(
//       `SELECT
//          id,
//          owner_id,
//          parent_id,
//          is_deleted
//        FROM folders
//        WHERE id = $1
//          AND owner_id = $2
//          AND is_deleted = FALSE`,
//       [
//         folderId,
//         file.owner_id,
//       ]
//     );

//     if (folderResult.rows.length === 0) {
//       return res.status(404).json({
//         error: {
//           code:
//             "DESTINATION_FOLDER_NOT_FOUND",
//           message:
//             "Destination folder not found",
//         },
//       });
//     }

//     if (
//       file.folder_id === folderId
//     ) {
//       return res.status(400).json({
//         error: {
//           code: "ALREADY_IN_FOLDER",
//           message:
//             "File is already in this folder",
//         },
//       });
//     }

//     const result = await pool.query(
//       `UPDATE files
//        SET folder_id = $1,
//            updated_at = NOW()
//        WHERE id = $2
//          AND is_deleted = FALSE
//        RETURNING
//          id,
//          name,
//          mime_type,
//          size_bytes,
//          owner_id,
//          folder_id,
//          created_at,
//          updated_at`,
//       [
//         folderId,
//         id,
//       ]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "File moved successfully",
//       file: result.rows[0],
//     });
//   } catch (error) {
//     console.error(
//       "Move file error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message:
//           "Unable to move file",
//       },
//     });
//   }
// };

// /* =========================================================
//    DOWNLOAD FILE
// ========================================================= */

// const downloadFile = async (req, res) => {
//   try {
//     const ownerId = req.user.userId;
//     const { id } = req.params;

//     const result = await pool.query(
//       `SELECT
//          name,
//          storage_key,
//          mime_type
//        FROM files
//        WHERE id = $1
//          AND owner_id = $2
//          AND is_deleted = FALSE`,
//       [id, ownerId]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     const file = result.rows[0];

//     const filePath = path.join(
//       uploadsDir,
//       file.storage_key
//     );

//     if (!fs.existsSync(filePath)) {
//       return res.status(404).json({
//         error: {
//           code:
//             "STORAGE_FILE_NOT_FOUND",
//           message:
//             "Stored file not found",
//         },
//       });
//     }

//     return res.download(
//       filePath,
//       file.name
//     );
//   } catch (error) {
//     console.error(
//       "Download file error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message:
//           "Unable to download file",
//       },
//     });
//   }
// };

// /* =========================================================
//    DELETE FILE
// ========================================================= */

// const deleteFile = async (req, res) => {
//   try {
//     const ownerId = req.user.userId;
//     const { id } = req.params;

//     const result = await pool.query(
//       `UPDATE files
//        SET is_deleted = TRUE,
//            updated_at = NOW()
//        WHERE id = $1
//          AND owner_id = $2
//          AND is_deleted = FALSE
//        RETURNING id`,
//       [id, ownerId]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         error: {
//           code: "FILE_NOT_FOUND",
//           message: "File not found",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message:
//         "File deleted successfully",
//     });
//   } catch (error) {
//     console.error(
//       "Delete file error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code: "INTERNAL_ERROR",
//         message:
//           "Unable to delete file",
//       },
//     });
//   }
// };

// /* =========================================================
//    FILE VERSIONING
// ========================================================= */

// const calculateChecksum = (filePath) => {
//   return new Promise(
//     (resolve, reject) => {
//       const hash =
//         crypto.createHash(
//           "sha256"
//         );

//       const stream =
//         fs.createReadStream(
//           filePath
//         );

//       stream.on(
//         "data",
//         (chunk) =>
//           hash.update(chunk)
//       );

//       stream.on(
//         "end",
//         () =>
//           resolve(
//             hash.digest("hex")
//           )
//       );

//       stream.on(
//         "error",
//         reject
//       );
//     }
//   );
// };

// const uploadNewVersion = async (
//   req,
//   res
// ) => {
//   const client =
//     await pool.connect();

//   try {
//     const userId =
//       req.user.userId;

//     const { id } =
//       req.params;

//     if (!req.file) {
//       return res.status(400).json({
//         error: {
//           code:
//             "FILE_REQUIRED",
//           message:
//             "Please select a file to upload",
//         },
//       });
//     }

//     const permission =
//       await getResourcePermission(
//         userId,
//         "file",
//         id
//       );

//     if (!permission) {
//       try {
//         fs.unlinkSync(
//           req.file.path
//         );
//       } catch {}

//       return res.status(404).json({
//         error: {
//           code:
//             "FILE_NOT_FOUND",
//           message:
//             "File not found",
//         },
//       });
//     }

//     if (
//       permission.role !==
//         "owner" &&
//       permission.role !==
//         "editor"
//     ) {
//       try {
//         fs.unlinkSync(
//           req.file.path
//         );
//       } catch {}

//       return res.status(403).json({
//         error: {
//           code: "FORBIDDEN",
//           message:
//             "You only have viewer permission for this file",
//         },
//       });
//     }

//     const fileResult =
//       await client.query(
//         `SELECT
//            id,
//            name,
//            mime_type,
//            size_bytes,
//            storage_key,
//            owner_id,
//            is_deleted
//          FROM files
//          WHERE id = $1
//            AND is_deleted = FALSE`,
//         [id]
//       );

//     if (
//       fileResult.rows.length ===
//       0
//     ) {
//       try {
//         fs.unlinkSync(
//           req.file.path
//         );
//       } catch {}

//       return res.status(404).json({
//         error: {
//           code:
//             "FILE_NOT_FOUND",
//           message:
//             "File not found",
//         },
//       });
//     }

//     const currentFile =
//       fileResult.rows[0];

//     const checksum =
//       await calculateChecksum(
//         req.file.path
//       );

//     await client.query(
//       "BEGIN"
//     );

//     const versionResult =
//       await client.query(
//         `SELECT
//            COALESCE(
//              MAX(version_number),
//              0
//            )::int AS max_version
//          FROM file_versions
//          WHERE file_id = $1`,
//         [id]
//       );

//     let nextVersion =
//       versionResult.rows[0]
//         .max_version + 1;

//     if (
//       nextVersion === 1
//     ) {
//       let currentChecksum =
//         null;

//       const currentPath =
//         path.join(
//           uploadsDir,
//           currentFile.storage_key
//         );

//       if (
//         fs.existsSync(
//           currentPath
//         )
//       ) {
//         try {
//           currentChecksum =
//             await calculateChecksum(
//               currentPath
//             );
//         } catch {}
//       }

//       await client.query(
//         `INSERT INTO file_versions
//          (
//            file_id,
//            version_number,
//            storage_key,
//            size_bytes,
//            checksum
//          )
//          VALUES
//          ($1, $2, $3, $4, $5)`,
//         [
//           id,
//           1,
//           currentFile.storage_key,
//           currentFile.size_bytes,
//           currentChecksum,
//         ]
//       );

//       nextVersion = 2;
//     }

//     await client.query(
//       `INSERT INTO file_versions
//        (
//          file_id,
//          version_number,
//          storage_key,
//          size_bytes,
//          checksum
//        )
//        VALUES
//        ($1, $2, $3, $4, $5)`,
//       [
//         id,
//         nextVersion,
//         req.file.filename,
//         req.file.size,
//         checksum,
//       ]
//     );

//     const updatedFile =
//       await client.query(
//         `UPDATE files
//          SET name = $1,
//              mime_type = $2,
//              size_bytes = $3,
//              storage_key = $4,
//              updated_at = NOW()
//          WHERE id = $5
//            AND is_deleted = FALSE
//          RETURNING
//            id,
//            name,
//            mime_type,
//            size_bytes,
//            owner_id,
//            folder_id,
//            created_at,
//            updated_at`,
//         [
//           req.file.originalname,
//           req.file.mimetype,
//           req.file.size,
//           req.file.filename,
//           id,
//         ]
//       );

//     await client.query(
//       "COMMIT"
//     );

//     return res.status(201).json({
//       success: true,
//       message:
//         `Version ${nextVersion} uploaded successfully`,
//       version: {
//         versionNumber:
//           nextVersion,
//         sizeBytes:
//           req.file.size,
//         checksum,
//         createdAt:
//           new Date(),
//       },
//       file:
//         updatedFile.rows[0],
//     });
//   } catch (error) {
//     await client
//       .query("ROLLBACK")
//       .catch(() => {});

//     if (
//       req.file?.path
//     ) {
//       try {
//         fs.unlinkSync(
//           req.file.path
//         );
//       } catch {}
//     }

//     console.error(
//       "Upload new version error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code:
//           "INTERNAL_ERROR",
//         message:
//           "Unable to upload new file version",
//       },
//     });
//   } finally {
//     client.release();
//   }
// };

// /* =========================================================
//    GET FILE VERSIONS
// ========================================================= */

// const getFileVersions = async (
//   req,
//   res
// ) => {
//   try {
//     const userId =
//       req.user.userId;

//     const { id } =
//       req.params;

//     const {
//       page,
//       limit,
//       offset,
//     } = getPagination(req);

//     const permission =
//       await getResourcePermission(
//         userId,
//         "file",
//         id
//       );

//     if (!permission) {
//       return res.status(404).json({
//         error: {
//           code:
//             "FILE_NOT_FOUND",
//           message:
//             "File not found",
//         },
//       });
//     }

//     const countResult =
//       await pool.query(
//         `SELECT
//            COUNT(*)::int AS total
//          FROM file_versions
//          WHERE file_id = $1`,
//         [id]
//       );

//     const total =
//       countResult.rows[0]
//         .total;

//     const totalPages =
//       Math.ceil(
//         total / limit
//       );

//     const result =
//       await pool.query(
//         `SELECT
//            id,
//            file_id,
//            version_number,
//            size_bytes,
//            checksum,
//            created_at
//          FROM file_versions
//          WHERE file_id = $1
//          ORDER BY
//            version_number DESC
//          LIMIT $2
//          OFFSET $3`,
//         [
//           id,
//           limit,
//           offset,
//         ]
//       );

//     return res.status(200).json({
//       success: true,
//       versions:
//         result.rows,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages,
//         hasNextPage:
//           page < totalPages,
//         hasPreviousPage:
//           page > 1,
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Get file versions error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code:
//           "INTERNAL_ERROR",
//         message:
//           "Unable to fetch file versions",
//       },
//     });
//   }
// };

// const downloadFileVersion =
//   async (req, res) => {
//     try {
//       const userId =
//         req.user.userId;

//       const {
//         id,
//         versionId,
//       } = req.params;

//       const permission =
//         await getResourcePermission(
//           userId,
//           "file",
//           id
//         );

//       if (!permission) {
//         return res.status(404).json({
//           error: {
//             code:
//               "FILE_NOT_FOUND",
//             message:
//               "File not found",
//           },
//         });
//       }

//       const result =
//         await pool.query(
//           `SELECT
//              fv.version_number,
//              fv.storage_key,
//              f.name,
//              f.mime_type
//            FROM file_versions fv
//            JOIN files f
//              ON f.id = fv.file_id
//            WHERE fv.id = $1
//              AND fv.file_id = $2`,
//           [
//             versionId,
//             id,
//           ]
//         );

//       if (
//         result.rows.length ===
//         0
//       ) {
//         return res.status(404).json({
//           error: {
//             code:
//               "VERSION_NOT_FOUND",
//             message:
//               "File version not found",
//           },
//         });
//       }

//       const version =
//         result.rows[0];

//       const filePath =
//         path.join(
//           uploadsDir,
//           version.storage_key
//         );

//       if (
//         !fs.existsSync(
//           filePath
//         )
//       ) {
//         return res.status(404).json({
//           error: {
//             code:
//               "STORAGE_FILE_NOT_FOUND",
//             message:
//               "Stored version file not found",
//           },
//         });
//       }

//       return res.download(
//         filePath,
//         version.name
//       );
//     } catch (error) {
//       console.error(
//         "Download file version error:",
//         error
//       );

//       return res.status(500).json({
//         error: {
//           code:
//             "INTERNAL_ERROR",
//           message:
//             "Unable to download file version",
//         },
//       });
//     }
//   };

// const restoreFileVersion =
//   async (req, res) => {
//     const client =
//       await pool.connect();

//     try {
//       const userId =
//         req.user.userId;

//       const {
//         id,
//         versionId,
//       } = req.params;

//       const permission =
//         await getResourcePermission(
//           userId,
//           "file",
//           id
//         );

//       if (!permission) {
//         return res.status(404).json({
//           error: {
//             code:
//               "FILE_NOT_FOUND",
//             message:
//               "File not found",
//           },
//         });
//       }

//       if (
//         permission.role !==
//           "owner" &&
//         permission.role !==
//           "editor"
//       ) {
//         return res.status(403).json({
//           error: {
//             code:
//               "FORBIDDEN",
//             message:
//               "You only have viewer permission for this file",
//           },
//         });
//       }

//       const versionResult =
//         await client.query(
//           `SELECT
//              fv.id,
//              fv.version_number,
//              fv.storage_key,
//              fv.size_bytes,
//              f.name,
//              f.mime_type
//            FROM file_versions fv
//            JOIN files f
//              ON f.id = fv.file_id
//            WHERE fv.id = $1
//              AND fv.file_id = $2
//              AND f.is_deleted = FALSE`,
//           [
//             versionId,
//             id,
//           ]
//         );

//       if (
//         versionResult.rows
//           .length === 0
//       ) {
//         return res.status(404).json({
//           error: {
//             code:
//               "VERSION_NOT_FOUND",
//             message:
//               "File version not found",
//           },
//         });
//       }

//       const version =
//         versionResult.rows[0];

//       const versionPath =
//         path.join(
//           uploadsDir,
//           version.storage_key
//         );

//       if (
//         !fs.existsSync(
//           versionPath
//         )
//       ) {
//         return res.status(404).json({
//           error: {
//             code:
//               "STORAGE_FILE_NOT_FOUND",
//             message:
//               "Stored version file not found",
//           },
//         });
//       }

//       await client.query(
//         "BEGIN"
//       );

//       const currentResult =
//         await client.query(
//           `SELECT
//              storage_key,
//              size_bytes
//            FROM files
//            WHERE id = $1
//              AND is_deleted = FALSE`,
//           [id]
//         );

//       const current =
//         currentResult.rows[0];

//       const currentVersionResult =
//         await client.query(
//           `SELECT id
//            FROM file_versions
//            WHERE file_id = $1
//              AND storage_key = $2
//            LIMIT 1`,
//           [
//             id,
//             current.storage_key,
//           ]
//         );

//       if (
//         currentVersionResult
//           .rows.length === 0
//       ) {
//         const maxResult =
//           await client.query(
//             `SELECT
//                COALESCE(
//                  MAX(version_number),
//                  0
//                )::int AS max_version
//              FROM file_versions
//              WHERE file_id = $1`,
//             [id]
//           );

//         const newVersionNumber =
//           maxResult.rows[0]
//             .max_version + 1;

//         let currentChecksum =
//           null;

//         const currentPath =
//           path.join(
//             uploadsDir,
//             current.storage_key
//           );

//         if (
//           fs.existsSync(
//             currentPath
//           )
//         ) {
//           try {
//             currentChecksum =
//               await calculateChecksum(
//                 currentPath
//               );
//           } catch {}
//         }

//         await client.query(
//           `INSERT INTO file_versions
//            (
//              file_id,
//              version_number,
//              storage_key,
//              size_bytes,
//              checksum
//            )
//            VALUES
//            ($1, $2, $3, $4, $5)`,
//           [
//             id,
//             newVersionNumber,
//             current.storage_key,
//             current.size_bytes,
//             currentChecksum,
//           ]
//         );
//       }

//       const updatedFile =
//         await client.query(
//           `UPDATE files
//            SET storage_key = $1,
//                size_bytes = $2,
//                updated_at = NOW()
//            WHERE id = $3
//              AND is_deleted = FALSE
//            RETURNING
//              id,
//              name,
//              mime_type,
//              size_bytes,
//              owner_id,
//              folder_id,
//              created_at,
//              updated_at`,
//           [
//             version.storage_key,
//             version.size_bytes,
//             id,
//           ]
//         );

//       await client.query(
//         "COMMIT"
//       );

//       return res.status(200).json({
//         success: true,
//         message:
//           `Version ${version.version_number} restored successfully`,
//         file:
//           updatedFile.rows[0],
//       });
//     } catch (error) {
//       await client
//         .query("ROLLBACK")
//         .catch(() => {});

//       console.error(
//         "Restore file version error:",
//         error
//       );

//       return res.status(500).json({
//         error: {
//           code:
//             "INTERNAL_ERROR",
//           message:
//             "Unable to restore file version",
//         },
//       });
//     } finally {
//       client.release();
//     }
//   };

// /* =========================================================
//    GET TRASH
// ========================================================= */

// const getTrash = async (
//   req,
//   res
// ) => {
//   try {
//     const ownerId =
//       req.user.userId;

//     const {
//       page,
//       limit,
//       offset,
//     } = getPagination(req);

//     const fileCountResult =
//       await pool.query(
//         `SELECT
//            COUNT(*)::int AS total
//          FROM files
//          WHERE owner_id = $1
//            AND is_deleted = TRUE`,
//         [ownerId]
//       );

//     const folderCountResult =
//       await pool.query(
//         `SELECT
//            COUNT(*)::int AS total
//          FROM folders
//          WHERE owner_id = $1
//            AND is_deleted = TRUE`,
//         [ownerId]
//       );

//     const fileTotal =
//       fileCountResult.rows[0]
//         .total;

//     const folderTotal =
//       folderCountResult.rows[0]
//         .total;

//     const files =
//       await pool.query(
//         `SELECT
//            id,
//            name,
//            mime_type,
//            size_bytes,
//            owner_id,
//            folder_id,
//            created_at,
//            updated_at
//          FROM files
//          WHERE owner_id = $1
//            AND is_deleted = TRUE
//          ORDER BY
//            updated_at DESC,
//            id DESC
//          LIMIT $2
//          OFFSET $3`,
//         [
//           ownerId,
//           limit,
//           offset,
//         ]
//       );

//     const folders =
//       await pool.query(
//         `SELECT
//            id,
//            name,
//            owner_id,
//            parent_id,
//            created_at,
//            updated_at
//          FROM folders
//          WHERE owner_id = $1
//            AND is_deleted = TRUE
//          ORDER BY
//            updated_at DESC,
//            id DESC
//          LIMIT $2
//          OFFSET $3`,
//         [
//           ownerId,
//           limit,
//           offset,
//         ]
//       );

//     const fileTotalPages =
//       Math.ceil(
//         fileTotal / limit
//       );

//     const folderTotalPages =
//       Math.ceil(
//         folderTotal / limit
//       );

//     return res.status(200).json({
//       success: true,
//       trash: {
//         files:
//           files.rows,
//         folders:
//           folders.rows,
//       },
//       pagination: {
//         page,
//         limit,
//         files: {
//           total:
//             fileTotal,
//           totalPages:
//             fileTotalPages,
//           hasNextPage:
//             page <
//             fileTotalPages,
//           hasPreviousPage:
//             page > 1,
//         },
//         folders: {
//           total:
//             folderTotal,
//           totalPages:
//             folderTotalPages,
//           hasNextPage:
//             page <
//             folderTotalPages,
//           hasPreviousPage:
//             page > 1,
//         },
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Get trash error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code:
//           "INTERNAL_ERROR",
//         message:
//           "Unable to fetch trash",
//       },
//     });
//   }
// };

// /* =========================================================
//    RESTORE FILE
// ========================================================= */

// const restoreFile = async (
//   req,
//   res
// ) => {
//   try {
//     const ownerId =
//       req.user.userId;

//     const { id } =
//       req.params;

//     const result =
//       await pool.query(
//         `UPDATE files
//          SET is_deleted = FALSE,
//              updated_at = NOW()
//          WHERE id = $1
//            AND owner_id = $2
//            AND is_deleted = TRUE
//          RETURNING
//            id,
//            name,
//            mime_type,
//            size_bytes,
//            owner_id,
//            folder_id,
//            created_at,
//            updated_at`,
//         [
//           id,
//           ownerId,
//         ]
//       );

//     if (
//       result.rows.length ===
//       0
//     ) {
//       return res.status(404).json({
//         error: {
//           code:
//             "FILE_NOT_IN_TRASH",
//           message:
//             "Deleted file not found",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message:
//         "File restored successfully",
//       file:
//         result.rows[0],
//     });
//   } catch (error) {
//     console.error(
//       "Restore file error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code:
//           "INTERNAL_ERROR",
//         message:
//           "Unable to restore file",
//       },
//     });
//   }
// };

// /* =========================================================
//    RESTORE FOLDER
// ========================================================= */

// const restoreFolder = async (
//   req,
//   res
// ) => {
//   try {
//     const ownerId =
//       req.user.userId;

//     const { id } =
//       req.params;

//     const folderResult =
//       await pool.query(
//         `SELECT
//            id,
//            name,
//            owner_id,
//            parent_id
//          FROM folders
//          WHERE id = $1
//            AND owner_id = $2
//            AND is_deleted = TRUE`,
//         [
//           id,
//           ownerId,
//         ]
//       );

//     if (
//       folderResult.rows.length ===
//       0
//     ) {
//       return res.status(404).json({
//         error: {
//           code:
//             "FOLDER_NOT_IN_TRASH",
//           message:
//             "Deleted folder not found",
//         },
//       });
//     }

//     const folder =
//       folderResult.rows[0];

//     let parentId =
//       folder.parent_id;

//     if (parentId) {
//       const parentResult =
//         await pool.query(
//           `SELECT id
//            FROM folders
//            WHERE id = $1
//              AND owner_id = $2
//              AND is_deleted = FALSE`,
//           [
//             parentId,
//             ownerId,
//           ]
//         );

//       if (
//         parentResult.rows
//           .length === 0
//       ) {
//         parentId = null;
//       }
//     }

//     const result =
//       await pool.query(
//         `UPDATE folders
//          SET is_deleted = FALSE,
//              parent_id = $1,
//              updated_at = NOW()
//          WHERE id = $2
//            AND owner_id = $3
//            AND is_deleted = TRUE
//          RETURNING
//            id,
//            name,
//            owner_id,
//            parent_id,
//            is_deleted,
//            created_at,
//            updated_at`,
//         [
//           parentId,
//           id,
//           ownerId,
//         ]
//       );

//     if (
//       result.rows.length ===
//       0
//     ) {
//       return res.status(404).json({
//         error: {
//           code:
//             "FOLDER_NOT_IN_TRASH",
//           message:
//             "Deleted folder not found",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message:
//         "Folder restored successfully",
//       folder:
//         result.rows[0],
//     });
//   } catch (error) {
//     console.error(
//       "Restore folder error:",
//       error
//     );

//     return res.status(500).json({
//       error: {
//         code:
//           "INTERNAL_ERROR",
//         message:
//           "Unable to restore folder",
//       },
//     });
//   }
// };

// /* =========================================================
//    SEARCH FILES AND FOLDERS
// ========================================================= */

// const searchFilesAndFolders =
//   async (req, res) => {
//     try {
//       const ownerId =
//         req.user.userId;

//       const queryParams =
//         req.validatedQuery ||
//         req.query ||
//         {};

//       const q =
//         queryParams.q || "";

//       const {
//         page,
//         limit,
//         offset,
//       } = getPagination(req);

//       const query =
//         q.trim();

//       if (!query) {
//         return res.status(200).json({
//           success: true,
//           files: [],
//           folders: [],
//           pagination: {
//             page,
//             limit,
//             total: 0,
//             totalPages: 0,
//             hasNextPage: false,
//             hasPreviousPage:
//               page > 1,
//           },
//         });
//       }

//       const searchTerm =
//         `%${query}%`;

//       const fileCountResult =
//         await pool.query(
//           `SELECT
//              COUNT(*)::int AS total
//            FROM files
//            WHERE owner_id = $1
//              AND is_deleted = FALSE
//              AND name ILIKE $2`,
//           [
//             ownerId,
//             searchTerm,
//           ]
//         );

//       const folderCountResult =
//         await pool.query(
//           `SELECT
//              COUNT(*)::int AS total
//            FROM folders
//            WHERE owner_id = $1
//              AND is_deleted = FALSE
//              AND name ILIKE $2`,
//           [
//             ownerId,
//             searchTerm,
//           ]
//         );

//       const fileTotal =
//         fileCountResult.rows[0]
//           .total;

//       const folderTotal =
//         folderCountResult.rows[0]
//           .total;

//       const files =
//         await pool.query(
//           `SELECT
//              id,
//              name,
//              mime_type,
//              size_bytes,
//              owner_id,
//              folder_id,
//              created_at,
//              updated_at
//            FROM files
//            WHERE owner_id = $1
//              AND is_deleted = FALSE
//              AND name ILIKE $2
//            ORDER BY
//              name ASC,
//              id ASC
//            LIMIT $3
//            OFFSET $4`,
//           [
//             ownerId,
//             searchTerm,
//             limit,
//             offset,
//           ]
//         );

//       const folders =
//         await pool.query(
//           `SELECT
//              id,
//              name,
//              owner_id,
//              parent_id,
//              is_deleted,
//              created_at,
//              updated_at
//            FROM folders
//            WHERE owner_id = $1
//              AND is_deleted = FALSE
//              AND name ILIKE $2
//            ORDER BY
//              name ASC,
//              id ASC
//            LIMIT $3
//            OFFSET $4`,
//           [
//             ownerId,
//             searchTerm,
//             limit,
//             offset,
//           ]
//         );

//       const fileTotalPages =
//         Math.ceil(
//           fileTotal / limit
//         );

//       const folderTotalPages =
//         Math.ceil(
//           folderTotal / limit
//         );

//       return res.status(200).json({
//         success: true,
//         query,
//         files:
//           files.rows,
//         folders:
//           folders.rows,
//         pagination: {
//           page,
//           limit,
//           files: {
//             total:
//               fileTotal,
//             totalPages:
//               fileTotalPages,
//             hasNextPage:
//               page <
//               fileTotalPages,
//             hasPreviousPage:
//               page > 1,
//           },
//           folders: {
//             total:
//               folderTotal,
//             totalPages:
//               folderTotalPages,
//             hasNextPage:
//               page <
//               folderTotalPages,
//             hasPreviousPage:
//               page > 1,
//           },
//         },
//       });
//     } catch (error) {
//       console.error(
//         "Search error:",
//         error
//       );

//       return res.status(500).json({
//         error: {
//           code:
//             "INTERNAL_ERROR",
//           message:
//             "Unable to search files and folders",
//         },
//       });
//     }
//   };

// /* =========================================================
//    GET RECENT FILES
// ========================================================= */

// const getRecentFiles =
//   async (req, res) => {
//     try {
//       const ownerId =
//         req.user.userId;

//       const {
//         page,
//         limit,
//         offset,
//       } = getPagination(req);

//       const countResult =
//         await pool.query(
//           `SELECT
//              COUNT(*)::int AS total
//            FROM files
//            WHERE owner_id = $1
//              AND is_deleted = FALSE`,
//           [ownerId]
//         );

//       const total =
//         countResult.rows[0]
//           .total;

//       const totalPages =
//         Math.ceil(
//           total / limit
//         );

//       const result =
//         await pool.query(
//           `SELECT
//              id,
//              name,
//              mime_type,
//              size_bytes,
//              owner_id,
//              folder_id,
//              created_at,
//              updated_at
//            FROM files
//            WHERE owner_id = $1
//              AND is_deleted = FALSE
//            ORDER BY
//              updated_at DESC,
//              id DESC
//            LIMIT $2
//            OFFSET $3`,
//           [
//             ownerId,
//             limit,
//             offset,
//           ]
//         );

//       return res.status(200).json({
//         success: true,
//         files:
//           result.rows,
//         pagination: {
//           page,
//           limit,
//           total,
//           totalPages,
//           hasNextPage:
//             page < totalPages,
//           hasPreviousPage:
//             page > 1,
//         },
//       });
//     } catch (error) {
//       console.error(
//         "Get recent files error:",
//         error
//       );

//       return res.status(500).json({
//         error: {
//           code:
//             "INTERNAL_ERROR",
//           message:
//             "Unable to fetch recent files",
//         },
//       });
//     }
//   };

// module.exports = {
//   uploadFile,
//   getFiles,
//   getStorageStats,
//   searchFilesAndFolders,
//   renameFile,
//   moveFile,
//   downloadFile,
//   deleteFile,
//   getTrash,
//   restoreFile,
//   restoreFolder,
//   uploadNewVersion,
//   getFileVersions,
//   downloadFileVersion,
//   restoreFileVersion,
//   getRecentFiles,
// };


const crypto = require("crypto");
const { Readable } = require("stream");

const {
  handleUpload,
} = require("@vercel/blob/client");

const {
  get,
  head,
} = require("@vercel/blob");

const { pool } = require("../config/database");

const {
  getResourcePermission,
} = require("../middleware/sharePermission");

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_FILENAME_LENGTH = 255;

/*
 * There is intentionally NO application-level file-size limit.
 *
 * Large files are uploaded directly from the browser to
 * Vercel Blob using multipart uploads.
 */

const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".com",
  ".bat",
  ".cmd",
  ".msi",
  ".msp",
  ".scr",
  ".pif",
  ".cpl",
  ".hta",
  ".jar",
  ".js",
  ".jse",
  ".vbs",
  ".vbe",
  ".ws",
  ".wsf",
  ".wsc",
  ".wsh",
  ".ps1",
  ".ps1xml",
  ".psc1",
  ".psd1",
  ".psm1",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
]);

/* =========================================================
   PAGINATION HELPER
========================================================= */

const getPagination = (req) => {
  const query = req.validatedQuery || req.query || {};

  const rawPage = query.page;
  const rawLimit = query.limit;

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
   FILE NAME / UPLOAD VALIDATION
========================================================= */

const validateFileName = (name) => {
  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return {
      valid: false,
      message: "File name is required",
    };
  }

  const trimmed = name.trim();

  if (
    trimmed.length >
    MAX_FILENAME_LENGTH
  ) {
    return {
      valid: false,
      message:
        "File name must be 255 characters or less",
    };
  }

  /*
   * Prevent path traversal and filesystem-like path
   * components from becoming Blob pathnames.
   */
  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    return {
      valid: false,
      message: "Invalid file name",
    };
  }

  /*
   * Keep control characters out of filenames.
   */
  for (const character of trimmed) {
    if (character.charCodeAt(0) < 32) {
      return {
        valid: false,
        message: "File name contains invalid characters",
      };
    }
  }

  const extensionIndex =
    trimmed.lastIndexOf(".");

  if (extensionIndex > 0) {
    const extension =
      trimmed
        .slice(extensionIndex)
        .toLowerCase();

    if (
      BLOCKED_EXTENSIONS.has(extension)
    ) {
      return {
        valid: false,
        message:
          "This file type is not allowed for security reasons",
      };
    }
  }

  return {
    valid: true,
    name: trimmed,
  };
};

const sanitizeBlobPathPart = (value) => {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
};

/* =========================================================
   BLOB PATH VALIDATION
========================================================= */

const isAllowedBlobPath = (
  pathname,
  userId
) => {
  if (
    typeof pathname !== "string" ||
    !pathname
  ) {
    return false;
  }

  if (
    pathname.includes("..") ||
    pathname.includes("\\")
  ) {
    return false;
  }

  const safeUserId =
    sanitizeBlobPathPart(userId);

  return (
    pathname.startsWith(
      `users/${safeUserId}/`
    )
  );
};

/* =========================================================
   BLOB RESPONSE HELPER
========================================================= */

const streamBlobToResponse = async (
  res,
  storageKey,
  fileName,
  mimeType
) => {
  if (
    !storageKey ||
    typeof storageKey !== "string"
  ) {
    return false;
  }

  let blobResult;

  try {
    blobResult = await get(
      storageKey,
      {
        access: "private",
      }
    );
  } catch (error) {
    console.error(
      "Vercel Blob get error:",
      error
    );

    return false;
  }

  if (
    !blobResult ||
    blobResult.statusCode !== 200 ||
    !blobResult.stream
  ) {
    return false;
  }

  const contentType =
    mimeType ||
    blobResult.blob?.contentType ||
    "application/octet-stream";

  res.setHeader(
    "Content-Type",
    contentType
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "Cache-Control",
    "private, no-cache"
  );

  /*
   * RFC 5987-compatible filename header.
   * This safely supports spaces and Unicode filenames.
   */
  const encodedFileName =
    encodeURIComponent(
      fileName || "download"
    );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="download"; filename*=UTF-8''${encodedFileName}`
  );

  if (
    blobResult.blob?.size !== null &&
    blobResult.blob?.size !== undefined
  ) {
    res.setHeader(
      "Content-Length",
      String(blobResult.blob.size)
    );
  }

  try {
    Readable.fromWeb(
      blobResult.stream
    ).pipe(res);
  } catch (error) {
    console.error(
      "Blob stream error:",
      error
    );

    return false;
  }

  return true;
};

/* =========================================================
   VERIFY BLOB EXISTS
========================================================= */

const verifyBlobExists = async (
  storageKey
) => {
  try {
    const blob = await head(
      storageKey
    );

    return blob;
  } catch (error) {
    console.error(
      "Blob head error:",
      error
    );

    return null;
  }
};

/* =========================================================
   VERCEL BLOB CLIENT UPLOAD HANDLER
========================================================= */

/*
 * This endpoint is used by @vercel/blob/client.
 *
 * It handles both:
 *
 * 1. Client-token generation
 * 2. Upload-completed callback
 *
 * The actual file bytes never pass through Express.
 */

const handleBlobUpload = async (
  req,
  res
) => {
  try {
    const body =
      req.body || {};

    const jsonResponse =
      await handleUpload({
        body,
        request: req,

        /* -------------------------------------------------
           BEFORE CLIENT TOKEN
        ------------------------------------------------- */

        onBeforeGenerateToken:
          async (
            pathname,
            clientPayload,
            multipart
          ) => {
            const userId =
              req.user?.userId;

            if (!userId) {
              throw new Error(
                "Authentication required"
              );
            }

            if (
              !isAllowedBlobPath(
                pathname,
                userId
              )
            ) {
              throw new Error(
                "Invalid upload path"
              );
            }

            let payload = {};

            if (
              clientPayload
            ) {
              try {
                payload =
                  JSON.parse(
                    clientPayload
                  );
              } catch {
                throw new Error(
                  "Invalid upload payload"
                );
              }
            }

            const purpose =
              payload.purpose || "file";

            const fileName =
              payload.fileName;

            const nameValidation =
              validateFileName(
                fileName
              );

            if (
              !nameValidation.valid
            ) {
              throw new Error(
                nameValidation.message
              );
            }

            /*
             * The pathname must correspond to the requested
             * operation.
             */

            const safeUserId =
              sanitizeBlobPathPart(
                userId
              );

            if (
              purpose === "file"
            ) {
              const expectedPrefix =
                `users/${safeUserId}/files/`;

              if (
                !pathname.startsWith(
                  expectedPrefix
                )
              ) {
                throw new Error(
                  "Invalid file upload path"
                );
              }

              const folderId =
                payload.folderId ||
                null;

              if (folderId) {
                const folder =
                  await pool.query(
                    `SELECT id
                     FROM folders
                     WHERE id = $1
                       AND owner_id = $2
                       AND is_deleted = FALSE`,
                    [
                      folderId,
                      userId,
                    ]
                  );

                if (
                  folder.rows.length ===
                  0
                ) {
                  throw new Error(
                    "Folder not found"
                  );
                }
              }
            } else if (
              purpose === "version"
            ) {
              const fileId =
                payload.fileId;

              if (!fileId) {
                throw new Error(
                  "File ID is required"
                );
              }

              const permission =
                await getResourcePermission(
                  userId,
                  "file",
                  fileId
                );

              if (!permission) {
                throw new Error(
                  "File not found"
                );
              }

              if (
                permission.role !==
                  "owner" &&
                permission.role !==
                  "editor"
              ) {
                throw new Error(
                  "You only have viewer permission for this file"
                );
              }

              const fileResult =
                await pool.query(
                  `SELECT id
                   FROM files
                   WHERE id = $1
                     AND is_deleted = FALSE`,
                  [fileId]
                );

              if (
                fileResult.rows.length ===
                0
              ) {
                throw new Error(
                  "File not found"
                );
              }

              const expectedPrefix =
                `users/${safeUserId}/versions/${fileId}/`;

              if (
                !pathname.startsWith(
                  expectedPrefix
                )
              ) {
                throw new Error(
                  "Invalid version upload path"
                );
              }
            } else {
              throw new Error(
                "Invalid upload purpose"
              );
            }

            return {
              /*
               * No maximumSizeInBytes is intentionally
               * supplied.
               *
               * Vercel Blob multipart uploads support very
               * large files without routing the file bytes
               * through this Function.
               */

              addRandomSuffix: true,

              /*
               * Private Blob store.
               */
              tokenPayload:
                JSON.stringify({
                  userId,
                  purpose,
                  fileName:
                    nameValidation.name,
                  folderId:
                    payload.folderId ||
                    null,
                  fileId:
                    payload.fileId ||
                    null,
                  contentType:
                    payload.contentType ||
                    "application/octet-stream",
                }),
            };
          },

        /* -------------------------------------------------
           UPLOAD COMPLETED
        ------------------------------------------------- */

        onUploadCompleted:
          async ({
            blob,
            tokenPayload,
          }) => {
            if (
              !tokenPayload
            ) {
              throw new Error(
                "Missing upload metadata"
              );
            }

            let payload;

            try {
              payload =
                JSON.parse(
                  tokenPayload
                );
            } catch {
              throw new Error(
                "Invalid upload metadata"
              );
            }

            const {
              userId,
              purpose,
              fileName,
              folderId,
              fileId,
              contentType,
            } = payload;

            if (
              !userId ||
              !blob?.pathname
            ) {
              throw new Error(
                "Invalid completed upload"
              );
            }

            if (
              !isAllowedBlobPath(
                blob.pathname,
                userId
              )
            ) {
              throw new Error(
                "Invalid completed blob path"
              );
            }

            const metadata =
              await verifyBlobExists(
                blob.pathname
              );

            if (!metadata) {
              throw new Error(
                "Uploaded blob could not be verified"
              );
            }

            const validatedName =
              validateFileName(
                fileName
              );

            if (
              !validatedName.valid
            ) {
              throw new Error(
                validatedName.message
              );
            }

            /* ---------------------------------------------
               NORMAL FILE
            --------------------------------------------- */

            if (
              purpose === "file"
            ) {
              if (
                folderId
              ) {
                const folder =
                  await pool.query(
                    `SELECT id
                     FROM folders
                     WHERE id = $1
                       AND owner_id = $2
                       AND is_deleted = FALSE`,
                    [
                      folderId,
                      userId,
                    ]
                  );

                if (
                  folder.rows.length ===
                  0
                ) {
                  throw new Error(
                    "Folder not found"
                  );
                }
              }

              await pool.query(
                `INSERT INTO files
                 (
                   name,
                   mime_type,
                   size_bytes,
                   storage_key,
                   owner_id,
                   folder_id
                 )
                 VALUES
                 ($1, $2, $3, $4, $5, $6)`,
                [
                  validatedName.name,
                  contentType ||
                    metadata.contentType ||
                    "application/octet-stream",
                  metadata.size,
                  blob.pathname,
                  userId,
                  folderId ||
                    null,
                ]
              );

              return;
            }

            /* ---------------------------------------------
               VERSION
            --------------------------------------------- */

            if (
              purpose === "version"
            ) {
              if (!fileId) {
                throw new Error(
                  "File ID is required"
                );
              }

              const permission =
                await getResourcePermission(
                  userId,
                  "file",
                  fileId
                );

              if (!permission) {
                throw new Error(
                  "File not found"
                );
              }

              if (
                permission.role !==
                  "owner" &&
                permission.role !==
                  "editor"
              ) {
                throw new Error(
                  "You only have viewer permission for this file"
                );
              }

              const client =
                await pool.connect();

              try {
                await client.query(
                  "BEGIN"
                );

                const fileResult =
                  await client.query(
                    `SELECT
                       id,
                       name,
                       mime_type,
                       size_bytes,
                       storage_key,
                       owner_id,
                       folder_id,
                       is_deleted
                     FROM files
                     WHERE id = $1
                       AND is_deleted = FALSE`,
                    [fileId]
                  );

                if (
                  fileResult.rows.length ===
                  0
                ) {
                  throw new Error(
                    "File not found"
                  );
                }

                const currentFile =
                  fileResult.rows[0];

                const versionResult =
                  await client.query(
                    `SELECT
                       COALESCE(
                         MAX(version_number),
                         0
                       )::int AS max_version
                     FROM file_versions
                     WHERE file_id = $1`,
                    [fileId]
                  );

                let nextVersion =
                  versionResult.rows[0]
                    .max_version + 1;

                /*
                 * Preserve the existing behavior:
                 * when the first version is created, the
                 * current file becomes version 1.
                 *
                 * We cannot calculate a SHA-256 checksum
                 * for an old local filesystem object that
                 * no longer exists in Vercel.
                 *
                 * For existing records, checksum is therefore
                 * left NULL when necessary.
                 */

                if (
                  nextVersion === 1
                ) {
                  await client.query(
                    `INSERT INTO file_versions
                     (
                       file_id,
                       version_number,
                       storage_key,
                       size_bytes,
                       checksum
                     )
                     VALUES
                     ($1, $2, $3, $4, $5)`,
                    [
                      fileId,
                      1,
                      currentFile.storage_key,
                      currentFile.size_bytes,
                      null,
                    ]
                  );

                  nextVersion = 2;
                }

                /*
                 * New Blob objects are immutable and have
                 * unique randomized pathnames.
                 *
                 * The Blob ETag is retained as the checksum
                 * value for newly uploaded versions.
                 */
                const checksum =
                  metadata.etag ||
                  null;

                await client.query(
                  `INSERT INTO file_versions
                   (
                     file_id,
                     version_number,
                     storage_key,
                     size_bytes,
                     checksum
                   )
                   VALUES
                   ($1, $2, $3, $4, $5)`,
                  [
                    fileId,
                    nextVersion,
                    blob.pathname,
                    metadata.size,
                    checksum,
                  ]
                );

                await client.query(
                  `UPDATE files
                   SET name = $1,
                       mime_type = $2,
                       size_bytes = $3,
                       storage_key = $4,
                       updated_at = NOW()
                   WHERE id = $5
                     AND is_deleted = FALSE`,
                  [
                    validatedName.name,
                    contentType ||
                      metadata.contentType ||
                      "application/octet-stream",
                    metadata.size,
                    blob.pathname,
                    fileId,
                  ]
                );

                await client.query(
                  "COMMIT"
                );
              } catch (error) {
                await client
                  .query("ROLLBACK")
                  .catch(() => {});

                throw error;
              } finally {
                client.release();
              }

              return;
            }

            throw new Error(
              "Invalid upload purpose"
            );
          },
      });

    return res
      .status(200)
      .json(jsonResponse);
  } catch (error) {
    console.error(
      "Blob upload handler error:",
      error
    );

    return res.status(400).json({
      error: {
        code: "UPLOAD_ERROR",
        message:
          error?.message ||
          "Unable to process upload",
      },
    });
  }
};

/* =========================================================
   LEGACY UPLOAD ENDPOINT
========================================================= */

/*
 * The old endpoint accepted multipart/form-data through
 * multer and wrote the file to /uploads.
 *
 * That architecture cannot work on Vercel Functions.
 *
 * New frontend code must use /blob-upload with
 * @vercel/blob/client.
 */

const uploadFile = async (
  req,
  res
) => {
  return res.status(410).json({
    error: {
      code: "LEGACY_UPLOAD_ENDPOINT",
      message:
        "The legacy upload endpoint has been replaced by Vercel Blob client uploads",
    },
  });
};

/* =========================================================
   GET FILES
========================================================= */

const getFiles = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const query =
      req.validatedQuery ||
      req.query ||
      {};

    const folderId =
      query.folderId;

    const {
      page,
      limit,
      offset,
    } = getPagination(req);

    const countResult =
      await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM files
         WHERE owner_id = $1
           AND is_deleted = FALSE
           AND (
             ($2::uuid IS NULL AND folder_id IS NULL)
             OR folder_id = $2::uuid
           )`,
        [
          ownerId,
          folderId || null,
        ]
      );

    const total =
      countResult.rows[0].total;

    const totalPages =
      Math.ceil(
        total / limit
      );

    const result =
      await pool.query(
        `SELECT
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at
         FROM files
         WHERE owner_id = $1
           AND is_deleted = FALSE
           AND (
             ($2::uuid IS NULL AND folder_id IS NULL)
             OR folder_id = $2::uuid
           )
         ORDER BY
           name ASC,
           id ASC
         LIMIT $3
         OFFSET $4`,
        [
          ownerId,
          folderId || null,
          limit,
          offset,
        ]
      );

    return res.status(200).json({
      success: true,
      files: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage:
          page < totalPages,
        hasPreviousPage:
          page > 1,
      },
    });
  } catch (error) {
    console.error(
      "Get files error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to fetch files",
      },
    });
  }
};

/* =========================================================
   STORAGE STATS
========================================================= */

const getStorageStats = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const files =
      await pool.query(
        `SELECT
           COUNT(*)::int AS file_count,
           COALESCE(
             SUM(size_bytes),
             0
           )::bigint AS storage_used
         FROM files
         WHERE owner_id = $1
           AND is_deleted = FALSE`,
        [ownerId]
      );

    const folders =
      await pool.query(
        `SELECT
           COUNT(*)::int AS folder_count
         FROM folders
         WHERE owner_id = $1
           AND is_deleted = FALSE`,
        [ownerId]
      );

    return res.status(200).json({
      success: true,
      stats: {
        fileCount:
          files.rows[0].file_count,
        folderCount:
          folders.rows[0].folder_count,
        storageUsed:
          Number(
            files.rows[0].storage_used
          ),
      },
    });
  } catch (error) {
    console.error(
      "Get storage stats error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to fetch storage statistics",
      },
    });
  }
};

/* =========================================================
   RENAME FILE
========================================================= */

const renameFile = async (
  req,
  res
) => {
  try {
    const userId =
      req.user.userId;

    const { id } =
      req.params;

    const { name } =
      req.body;

    if (
      !name ||
      !name.trim()
    ) {
      return res.status(400).json({
        error: {
          code:
            "VALIDATION_ERROR",
          message:
            "File name is required",
        },
      });
    }

    const trimmedName =
      name.trim();

    if (
      trimmedName.length >
      255
    ) {
      return res.status(400).json({
        error: {
          code:
            "VALIDATION_ERROR",
          message:
            "File name must be 255 characters or less",
        },
      });
    }

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    if (
      permission.role !==
        "owner" &&
      permission.role !==
        "editor"
    ) {
      return res.status(403).json({
        error: {
          code:
            "FORBIDDEN",
          message:
            "You only have viewer permission for this file",
        },
      });
    }

    const result =
      await pool.query(
        `UPDATE files
         SET name = $1,
             updated_at = NOW()
         WHERE id = $2
           AND is_deleted = FALSE
         RETURNING
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at`,
        [
          trimmedName,
          id,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "File renamed successfully",
      file:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Rename file error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to rename file",
      },
    });
  }
};

/* =========================================================
   MOVE FILE
========================================================= */

const moveFile = async (
  req,
  res
) => {
  try {
    const userId =
      req.user.userId;

    const { id } =
      req.params;

    const {
      folderId = null,
    } = req.body;

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    if (
      permission.role !==
        "owner" &&
      permission.role !==
        "editor"
    ) {
      return res.status(403).json({
        error: {
          code:
            "FORBIDDEN",
          message:
            "You only have viewer permission for this file",
        },
      });
    }

    const fileResult =
      await pool.query(
        `SELECT
           id,
           name,
           owner_id,
           folder_id,
           is_deleted
         FROM files
         WHERE id = $1
           AND is_deleted = FALSE`,
        [id]
      );

    if (
      fileResult.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    const file =
      fileResult.rows[0];

    if (
      folderId === null ||
      folderId === ""
    ) {
      const result =
        await pool.query(
          `UPDATE files
           SET folder_id = NULL,
               updated_at = NOW()
           WHERE id = $1
             AND is_deleted = FALSE
           RETURNING
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at`,
          [id]
        );

      return res.status(200).json({
        success: true,
        message:
          "File moved successfully",
        file:
          result.rows[0],
      });
    }

    const folderResult =
      await pool.query(
        `SELECT
           id,
           owner_id,
           parent_id,
           is_deleted
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [
          folderId,
          file.owner_id,
        ]
      );

    if (
      folderResult.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "DESTINATION_FOLDER_NOT_FOUND",
          message:
            "Destination folder not found",
        },
      });
    }

    if (
      file.folder_id ===
      folderId
    ) {
      return res.status(400).json({
        error: {
          code:
            "ALREADY_IN_FOLDER",
          message:
            "File is already in this folder",
        },
      });
    }

    const result =
      await pool.query(
        `UPDATE files
         SET folder_id = $1,
             updated_at = NOW()
         WHERE id = $2
           AND is_deleted = FALSE
         RETURNING
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at`,
        [
          folderId,
          id,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "File moved successfully",
      file:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Move file error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to move file",
      },
    });
  }
};

/* =========================================================
   DOWNLOAD FILE
========================================================= */

const downloadFile = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const { id } =
      req.params;

    const result =
      await pool.query(
        `SELECT
           name,
           storage_key,
           mime_type
         FROM files
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE`,
        [
          id,
          ownerId,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    const file =
      result.rows[0];

    const streamed =
      await streamBlobToResponse(
        res,
        file.storage_key,
        file.name,
        file.mime_type
      );

    if (!streamed) {
      return res.status(404).json({
        error: {
          code:
            "STORAGE_FILE_NOT_FOUND",
          message:
            "Stored file not found",
        },
      });
    }

    return undefined;
  } catch (error) {
    console.error(
      "Download file error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to download file",
      },
    });
  }
};
/* =========================================================
   DELETE FILE
========================================================= */

const deleteFile = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const { id } =
      req.params;

    const result =
      await pool.query(
        `UPDATE files
         SET is_deleted = TRUE,
             updated_at = NOW()
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = FALSE
         RETURNING id`,
        [
          id,
          ownerId,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    /*
     * IMPORTANT:
     *
     * Moving a file to Trash does NOT delete its Blob.
     * This preserves the existing restore behavior.
     */

    return res.status(200).json({
      success: true,
      message:
        "File deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete file error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to delete file",
      },
    });
  }
};

/* =========================================================
   LEGACY VERSION UPLOAD ENDPOINT
========================================================= */

/*
 * Version file bytes are no longer accepted by Express.
 *
 * The frontend uploads the new version directly to
 * Vercel Blob through handleBlobUpload().
 *
 * The database version record is created by
 * onUploadCompleted in handleBlobUpload().
 */

const uploadNewVersion = async (
  req,
  res
) => {
  return res.status(410).json({
    error: {
      code:
        "LEGACY_VERSION_UPLOAD_ENDPOINT",
      message:
        "Version uploads now use direct Vercel Blob client uploads",
    },
  });
};

/* =========================================================
   GET FILE VERSIONS
========================================================= */

const getFileVersions = async (
  req,
  res
) => {
  try {
    const userId =
      req.user.userId;

    const { id } =
      req.params;

    const {
      page,
      limit,
      offset,
    } = getPagination(req);

    const permission =
      await getResourcePermission(
        userId,
        "file",
        id
      );

    if (!permission) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_FOUND",
          message:
            "File not found",
        },
      });
    }

    const countResult =
      await pool.query(
        `SELECT
           COUNT(*)::int AS total
         FROM file_versions
         WHERE file_id = $1`,
        [id]
      );

    const total =
      countResult.rows[0]
        .total;

    const totalPages =
      Math.ceil(
        total / limit
      );

    const result =
      await pool.query(
        `SELECT
           id,
           file_id,
           version_number,
           size_bytes,
           checksum,
           created_at
         FROM file_versions
         WHERE file_id = $1
         ORDER BY
           version_number DESC
         LIMIT $2
         OFFSET $3`,
        [
          id,
          limit,
          offset,
        ]
      );

    return res.status(200).json({
      success: true,
      versions:
        result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage:
          page < totalPages,
        hasPreviousPage:
          page > 1,
      },
    });
  } catch (error) {
    console.error(
      "Get file versions error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to fetch file versions",
      },
    });
  }
};

/* =========================================================
   DOWNLOAD FILE VERSION
========================================================= */

const downloadFileVersion =
  async (req, res) => {
    try {
      const userId =
        req.user.userId;

      const {
        id,
        versionId,
      } = req.params;

      const permission =
        await getResourcePermission(
          userId,
          "file",
          id
        );

      if (!permission) {
        return res.status(404).json({
          error: {
            code:
              "FILE_NOT_FOUND",
            message:
              "File not found",
          },
        });
      }

      const result =
        await pool.query(
          `SELECT
             fv.version_number,
             fv.storage_key,
             f.name,
             f.mime_type
           FROM file_versions fv
           JOIN files f
             ON f.id = fv.file_id
           WHERE fv.id = $1
             AND fv.file_id = $2`,
          [
            versionId,
            id,
          ]
        );

      if (
        result.rows.length ===
        0
      ) {
        return res.status(404).json({
          error: {
            code:
              "VERSION_NOT_FOUND",
            message:
              "File version not found",
          },
        });
      }

      const version =
        result.rows[0];

      const streamed =
        await streamBlobToResponse(
          res,
          version.storage_key,
          version.name,
          version.mime_type
        );

      if (!streamed) {
        return res.status(404).json({
          error: {
            code:
              "STORAGE_FILE_NOT_FOUND",
            message:
              "Stored version file not found",
          },
        });
      }

      return undefined;
    } catch (error) {
      console.error(
        "Download file version error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to download file version",
        },
      });
    }
  };

/* =========================================================
   RESTORE FILE VERSION
========================================================= */

const restoreFileVersion =
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const userId =
        req.user.userId;

      const {
        id,
        versionId,
      } = req.params;

      const permission =
        await getResourcePermission(
          userId,
          "file",
          id
        );

      if (!permission) {
        return res.status(404).json({
          error: {
            code:
              "FILE_NOT_FOUND",
            message:
              "File not found",
          },
        });
      }

      if (
        permission.role !==
          "owner" &&
        permission.role !==
          "editor"
      ) {
        return res.status(403).json({
          error: {
            code:
              "FORBIDDEN",
            message:
              "You only have viewer permission for this file",
          },
        });
      }

      const versionResult =
        await client.query(
          `SELECT
             fv.id,
             fv.version_number,
             fv.storage_key,
             fv.size_bytes,
             f.name,
             f.mime_type
           FROM file_versions fv
           JOIN files f
             ON f.id = fv.file_id
           WHERE fv.id = $1
             AND fv.file_id = $2
             AND f.is_deleted = FALSE`,
          [
            versionId,
            id,
          ]
        );

      if (
        versionResult.rows
          .length === 0
      ) {
        return res.status(404).json({
          error: {
            code:
              "VERSION_NOT_FOUND",
            message:
              "File version not found",
          },
        });
      }

      const version =
        versionResult.rows[0];

      /*
       * Verify the version's Blob still exists before
       * changing the current file record.
       */

      const versionBlob =
        await verifyBlobExists(
          version.storage_key
        );

      if (!versionBlob) {
        return res.status(404).json({
          error: {
            code:
              "STORAGE_FILE_NOT_FOUND",
            message:
              "Stored version file not found",
          },
        });
      }

      await client.query(
        "BEGIN"
      );

      const currentResult =
        await client.query(
          `SELECT
             storage_key,
             size_bytes
           FROM files
           WHERE id = $1
             AND is_deleted = FALSE`,
          [id]
        );

      if (
        currentResult.rows.length ===
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error: {
            code:
              "FILE_NOT_FOUND",
            message:
              "File not found",
          },
        });
      }

      const current =
        currentResult.rows[0];

      /*
       * Preserve the current version before restoring an
       * older version if it isn't already in file_versions.
       */

      const currentVersionResult =
        await client.query(
          `SELECT id
           FROM file_versions
           WHERE file_id = $1
             AND storage_key = $2
           LIMIT 1`,
          [
            id,
            current.storage_key,
          ]
        );

      if (
        currentVersionResult
          .rows.length === 0
      ) {
        const maxResult =
          await client.query(
            `SELECT
               COALESCE(
                 MAX(version_number),
                 0
               )::int AS max_version
             FROM file_versions
             WHERE file_id = $1`,
            [id]
          );

        const newVersionNumber =
          maxResult.rows[0]
            .max_version + 1;

        let currentChecksum =
          null;

        /*
         * New Vercel Blob files can expose an ETag.
         * Older local-storage records may no longer exist
         * after deployment, so checksum remains NULL if
         * the Blob cannot be found.
         */

        const currentBlob =
          await verifyBlobExists(
            current.storage_key
          );

        if (currentBlob) {
          currentChecksum =
            currentBlob.etag ||
            null;
        }

        await client.query(
          `INSERT INTO file_versions
           (
             file_id,
             version_number,
             storage_key,
             size_bytes,
             checksum
           )
           VALUES
           ($1, $2, $3, $4, $5)`,
          [
            id,
            newVersionNumber,
            current.storage_key,
            current.size_bytes,
            currentChecksum,
          ]
        );
      }

      const updatedFile =
        await client.query(
          `UPDATE files
           SET storage_key = $1,
               size_bytes = $2,
               updated_at = NOW()
           WHERE id = $3
             AND is_deleted = FALSE
           RETURNING
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at`,
          [
            version.storage_key,
            version.size_bytes,
            id,
          ]
        );

      await client.query(
        "COMMIT"
      );

      return res.status(200).json({
        success: true,
        message:
          `Version ${version.version_number} restored successfully`,
        file:
          updatedFile.rows[0],
      });
    } catch (error) {
      await client
        .query("ROLLBACK")
        .catch(() => {});

      console.error(
        "Restore file version error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to restore file version",
        },
      });
    } finally {
      client.release();
    }
  };

/* =========================================================
   GET TRASH
========================================================= */

const getTrash = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const {
      page,
      limit,
      offset,
    } = getPagination(req);

    const fileCountResult =
      await pool.query(
        `SELECT
           COUNT(*)::int AS total
         FROM files
         WHERE owner_id = $1
           AND is_deleted = TRUE`,
        [ownerId]
      );

    const folderCountResult =
      await pool.query(
        `SELECT
           COUNT(*)::int AS total
         FROM folders
         WHERE owner_id = $1
           AND is_deleted = TRUE`,
        [ownerId]
      );

    const fileTotal =
      fileCountResult.rows[0]
        .total;

    const folderTotal =
      folderCountResult.rows[0]
        .total;

    const files =
      await pool.query(
        `SELECT
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at
         FROM files
         WHERE owner_id = $1
           AND is_deleted = TRUE
         ORDER BY
           updated_at DESC,
           id DESC
         LIMIT $2
         OFFSET $3`,
        [
          ownerId,
          limit,
          offset,
        ]
      );

    const folders =
      await pool.query(
        `SELECT
           id,
           name,
           owner_id,
           parent_id,
           created_at,
           updated_at
         FROM folders
         WHERE owner_id = $1
           AND is_deleted = TRUE
         ORDER BY
           updated_at DESC,
           id DESC
         LIMIT $2
         OFFSET $3`,
        [
          ownerId,
          limit,
          offset,
        ]
      );

    const fileTotalPages =
      Math.ceil(
        fileTotal / limit
      );

    const folderTotalPages =
      Math.ceil(
        folderTotal / limit
      );

    return res.status(200).json({
      success: true,
      trash: {
        files:
          files.rows,
        folders:
          folders.rows,
      },
      pagination: {
        page,
        limit,
        files: {
          total:
            fileTotal,
          totalPages:
            fileTotalPages,
          hasNextPage:
            page <
            fileTotalPages,
          hasPreviousPage:
            page > 1,
        },
        folders: {
          total:
            folderTotal,
          totalPages:
            folderTotalPages,
          hasNextPage:
            page <
            folderTotalPages,
          hasPreviousPage:
            page > 1,
        },
      },
    });
  } catch (error) {
    console.error(
      "Get trash error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to fetch trash",
      },
    });
  }
};

/* =========================================================
   RESTORE FILE
========================================================= */

const restoreFile = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const { id } =
      req.params;

    const result =
      await pool.query(
        `UPDATE files
         SET is_deleted = FALSE,
             updated_at = NOW()
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = TRUE
         RETURNING
           id,
           name,
           mime_type,
           size_bytes,
           owner_id,
           folder_id,
           created_at,
           updated_at`,
        [
          id,
          ownerId,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FILE_NOT_IN_TRASH",
          message:
            "Deleted file not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "File restored successfully",
      file:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Restore file error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to restore file",
      },
    });
  }
};

/* =========================================================
   RESTORE FOLDER
========================================================= */

const restoreFolder = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.user.userId;

    const { id } =
      req.params;

    const folderResult =
      await pool.query(
        `SELECT
           id,
           name,
           owner_id,
           parent_id
         FROM folders
         WHERE id = $1
           AND owner_id = $2
           AND is_deleted = TRUE`,
        [
          id,
          ownerId,
        ]
      );

    if (
      folderResult.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FOLDER_NOT_IN_TRASH",
          message:
            "Deleted folder not found",
        },
      });
    }

    const folder =
      folderResult.rows[0];

    let parentId =
      folder.parent_id;

    if (parentId) {
      const parentResult =
        await pool.query(
          `SELECT id
           FROM folders
           WHERE id = $1
             AND owner_id = $2
             AND is_deleted = FALSE`,
          [
            parentId,
            ownerId,
          ]
        );

      if (
        parentResult.rows
          .length === 0
      ) {
        parentId = null;
      }
    }

    const result =
      await pool.query(
        `UPDATE folders
         SET is_deleted = FALSE,
             parent_id = $1,
             updated_at = NOW()
         WHERE id = $2
           AND owner_id = $3
           AND is_deleted = TRUE
         RETURNING
           id,
           name,
           owner_id,
           parent_id,
           is_deleted,
           created_at,
           updated_at`,
        [
          parentId,
          id,
          ownerId,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return res.status(404).json({
        error: {
          code:
            "FOLDER_NOT_IN_TRASH",
          message:
            "Deleted folder not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Folder restored successfully",
      folder:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Restore folder error:",
      error
    );

    return res.status(500).json({
      error: {
        code:
          "INTERNAL_ERROR",
        message:
          "Unable to restore folder",
      },
    });
  }
};
/* =========================================================
   SEARCH FILES AND FOLDERS
========================================================= */

const searchFilesAndFolders =
  async (req, res) => {
    try {
      const ownerId =
        req.user.userId;

      const queryParams =
        req.validatedQuery ||
        req.query ||
        {};

      const q =
        queryParams.q || "";

      const {
        page,
        limit,
        offset,
      } = getPagination(req);

      const query =
        q.trim();

      if (!query) {
        return res.status(200).json({
          success: true,
          files: [],
          folders: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage:
              page > 1,
          },
        });
      }

      const searchTerm =
        `%${query}%`;

      const fileCountResult =
        await pool.query(
          `SELECT
             COUNT(*)::int AS total
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2`,
          [
            ownerId,
            searchTerm,
          ]
        );

      const folderCountResult =
        await pool.query(
          `SELECT
             COUNT(*)::int AS total
           FROM folders
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2`,
          [
            ownerId,
            searchTerm,
          ]
        );

      const fileTotal =
        fileCountResult.rows[0]
          .total;

      const folderTotal =
        folderCountResult.rows[0]
          .total;

      const files =
        await pool.query(
          `SELECT
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2
           ORDER BY
             name ASC,
             id ASC
           LIMIT $3
           OFFSET $4`,
          [
            ownerId,
            searchTerm,
            limit,
            offset,
          ]
        );

      const folders =
        await pool.query(
          `SELECT
             id,
             name,
             owner_id,
             parent_id,
             is_deleted,
             created_at,
             updated_at
           FROM folders
           WHERE owner_id = $1
             AND is_deleted = FALSE
             AND name ILIKE $2
           ORDER BY
             name ASC,
             id ASC
           LIMIT $3
           OFFSET $4`,
          [
            ownerId,
            searchTerm,
            limit,
            offset,
          ]
        );

      const fileTotalPages =
        Math.ceil(
          fileTotal / limit
        );

      const folderTotalPages =
        Math.ceil(
          folderTotal / limit
        );

      return res.status(200).json({
        success: true,
        query,
        files:
          files.rows,
        folders:
          folders.rows,
        pagination: {
          page,
          limit,
          files: {
            total:
              fileTotal,
            totalPages:
              fileTotalPages,
            hasNextPage:
              page <
              fileTotalPages,
            hasPreviousPage:
              page > 1,
          },
          folders: {
            total:
              folderTotal,
            totalPages:
              folderTotalPages,
            hasNextPage:
              page <
              folderTotalPages,
            hasPreviousPage:
              page > 1,
          },
        },
      });
    } catch (error) {
      console.error(
        "Search error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to search files and folders",
        },
      });
    }
  };

/* =========================================================
   GET RECENT FILES
========================================================= */

const getRecentFiles =
  async (req, res) => {
    try {
      const ownerId =
        req.user.userId;

      const {
        page,
        limit,
        offset,
      } = getPagination(req);

      const countResult =
        await pool.query(
          `SELECT
             COUNT(*)::int AS total
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE`,
          [ownerId]
        );

      const total =
        countResult.rows[0]
          .total;

      const totalPages =
        Math.ceil(
          total / limit
        );

      const result =
        await pool.query(
          `SELECT
             id,
             name,
             mime_type,
             size_bytes,
             owner_id,
             folder_id,
             created_at,
             updated_at
           FROM files
           WHERE owner_id = $1
             AND is_deleted = FALSE
           ORDER BY
             updated_at DESC,
             id DESC
           LIMIT $2
           OFFSET $3`,
          [
            ownerId,
            limit,
            offset,
          ]
        );

      return res.status(200).json({
        success: true,
        files:
          result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage:
            page < totalPages,
          hasPreviousPage:
            page > 1,
        },
      });
    } catch (error) {
      console.error(
        "Get recent files error:",
        error
      );

      return res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",
          message:
            "Unable to fetch recent files",
        },
      });
    }
  };

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  handleBlobUpload,
  uploadFile,
  getFiles,
  getStorageStats,
  searchFilesAndFolders,
  renameFile,
  moveFile,
  downloadFile,
  deleteFile,
  getTrash,
  restoreFile,
  restoreFolder,
  uploadNewVersion,
  getFileVersions,
  downloadFileVersion,
  restoreFileVersion,
  getRecentFiles,
};