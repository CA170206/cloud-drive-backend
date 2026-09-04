const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

const uploadsDir = path.join(__dirname, "../../uploads");
const RETENTION_DAYS = 30;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

async function removeFileFromDisk(storageKey) {
  if (!storageKey) return;

  const candidates = [
    path.join(uploadsDir, storageKey),
    path.isAbsolute(storageKey) ? storageKey : null,
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      await fs.promises.unlink(filePath);
      return;
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("File delete failed:", filePath, err.message);
      }
    }
  }
}

async function cleanupTrash() {
  const client = await pool.connect();

  try {
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    await client.query("BEGIN");

    const filesResult = await client.query(
      `SELECT id, storage_key
       FROM files
       WHERE is_deleted = TRUE
         AND updated_at < $1`,
      [cutoff]
    );

    for (const file of filesResult.rows) {
      const versionsResult = await client.query(
        `SELECT storage_key
         FROM file_versions
         WHERE file_id = $1`,
        [file.id]
      );

      for (const version of versionsResult.rows) {
        await removeFileFromDisk(version.storage_key);
      }

      await removeFileFromDisk(file.storage_key);

      await client.query(
        `DELETE FROM link_shares
         WHERE resource_type = 'file'
           AND resource_id = $1`,
        [file.id]
      );

      await client.query(
        `DELETE FROM shares
         WHERE resource_type = 'file'
           AND resource_id = $1`,
        [file.id]
      );

      await client.query(
        `DELETE FROM stars
         WHERE resource_type = 'file'
           AND resource_id = $1`,
        [file.id]
      );

      await client.query(
        `DELETE FROM file_versions
         WHERE file_id = $1`,
        [file.id]
      );

      await client.query(
        `DELETE FROM files
         WHERE id = $1`,
        [file.id]
      );
    }

    const foldersResult = await client.query(
      `SELECT id
       FROM folders
       WHERE is_deleted = TRUE
         AND updated_at < $1
       ORDER BY updated_at ASC`,
      [cutoff]
    );

    for (const folder of foldersResult.rows) {
      const fileCheck = await client.query(
        `SELECT 1
         FROM files
         WHERE folder_id = $1
         LIMIT 1`,
        [folder.id]
      );

      if (fileCheck.rows.length > 0) continue;

      const childFolderCheck = await client.query(
        `SELECT 1
         FROM folders
         WHERE parent_id = $1
         LIMIT 1`,
        [folder.id]
      );

      if (childFolderCheck.rows.length > 0) continue;

      await client.query(
        `DELETE FROM shares
         WHERE resource_type = 'folder'
           AND resource_id = $1`,
        [folder.id]
      );

      await client.query(
        `DELETE FROM link_shares
         WHERE resource_type = 'folder'
           AND resource_id = $1`,
        [folder.id]
      );

      await client.query(
        `DELETE FROM folders
         WHERE id = $1`,
        [folder.id]
      );
    }

    await client.query("COMMIT");

    console.log(
      `Trash cleanup completed: ${filesResult.rowCount} files processed, ${foldersResult.rowCount} folders checked`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Trash cleanup failed:", error);
  } finally {
    client.release();
  }
}

function startTrashCleanup() {
  console.log("Trash cleanup started");

  cleanupTrash();

  setInterval(() => {
    cleanupTrash();
  }, INTERVAL_MS);
}

module.exports = {
  startTrashCleanup,
  cleanupTrash,
};