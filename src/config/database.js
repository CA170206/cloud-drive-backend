const { Pool } = require("pg");

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

let pool = null;

if (process.env.DATABASE_URL) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    pool = new Pool({
      host: dbUrl.hostname,
      port: dbUrl.port ? Number(dbUrl.port) : 5432,
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.replace("/", ""),
      ssl: {
        rejectUnauthorized: false,
      },
    });

    pool.on("error", (error) => {
      console.error("Unexpected database error:", error);
    });
  } catch (error) {
    console.error("❌ Invalid DATABASE_URL:", error.message);
  }
} else {
  console.warn("⚠️ DATABASE_URL is missing from environment variables");
}

const connectDatabase = async () => {
  if (!pool) {
    throw new Error("DATABASE_URL environment variable is missing on server");
  }
  const client = await pool.connect();
  const result = await client.query("SELECT NOW() AS current_time");
  console.log("✅ PostgreSQL connected successfully at", result.rows[0].current_time);
  client.release();
};

module.exports = {
  pool,
  connectDatabase,
};