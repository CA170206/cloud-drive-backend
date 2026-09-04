const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

const RETENTION_DAYS = 30;
const RUN_INTERVAL = 24 * 60 * 60 * 1000;
const uploadsDir = path.join(__dirname, "../../uploads");

async function deleteStoredFile(storageKey) {
  if (!storageKey) return;

  const filePath = path.join(uploadsDir, path.basename(storageKey));

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not delete stored file:", error.message);
    }
  }
}

async function cleanupTrash() {
  let client;

  try {
    client = await pool.connect();

    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    await client.query("BEGIN");

    const filesResult = await client.query(
      `
      SELECT id, storage_key
      FROM files
      WHERE is_deleted = TRUE
        AND updated_at < $1
      `,
      [cutoff]
    );

    for (const file of filesResult.rows) {
      const versionsResult = await client.query(
        `
        SELECT storage_key
        FROM file_versions
        WHERE file_id = $1
        `,
        [file.id]
      );

      for (const version of versionsResult.rows) {
        await deleteStoredFile(version.storage_key);
      }

      await deleteStoredFile(file.storage_key);

      await client.query(
        `DELETE FROM file_versions WHERE file_id = $1`,
        [file.id]
      );

      await client.query(
        `
        DELETE FROM link_shares
        WHERE resource_type = 'file'
          AND resource_id = $1
        `,
        [file.id]
      );

      await client.query(
        `
        DELETE FROM shares
        WHERE resource_type = 'file'
          AND resource_id = $1
        `,
        [file.id]
      );

      await client.query(
        `
        DELETE FROM files
        WHERE id = $1
        `,
        [file.id]
      );
    }

    const foldersResult = await client.query(
      `
      SELECT id
      FROM folders
      WHERE is_deleted = TRUE
        AND updated_at < $1
      `,
      [cutoff]
    );

    for (const folder of foldersResult.rows) {
      const children = await client.query(
        `
        SELECT 1
        FROM folders
        WHERE parent_id = $1
          AND is_deleted = FALSE
        LIMIT 1
        `,
        [folder.id]
      );

      if (children.rows.length > 0) continue;

      const files = await client.query(
        `
        SELECT 1
        FROM files
        WHERE folder_id = $1
        LIMIT 1
        `,
        [folder.id]
      );

      if (files.rows.length > 0) continue;

      await client.query(
        `
        DELETE FROM link_shares
        WHERE resource_type = 'folder'
          AND resource_id = $1
        `,
        [folder.id]
      );

      await client.query(
        `
        DELETE FROM shares
        WHERE resource_type = 'folder'
          AND resource_id = $1
        `,
        [folder.id]
      );

      await client.query(
        `DELETE FROM folders WHERE id = $1`,
        [folder.id]
      );
    }

    await client.query("COMMIT");

    console.log(
      `Trash cleanup completed: ${filesResult.rowCount} files, ${foldersResult.rowCount} folders checked`
    );
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    console.error(
      "Trash cleanup skipped:",
      error.code || error.message
    );
  } finally {
    if (client) client.release();
  }
}

function startTrashCleanup() {
  console.log("Trash cleanup started");

  setTimeout(() => {
    cleanupTrash();
  }, 5000);

  setInterval(() => {
    cleanupTrash();
  }, RUN_INTERVAL);
}

module.exports = {
  startTrashCleanup,
  cleanupTrash,
};