const { Pool } = require("pg");

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

let pool = null;
let isConnected = false;

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
      // Serverless-friendly pool settings
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (error) => {
      console.error("Unexpected database error:", error);
      isConnected = false;
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

  // Skip repeated health-check queries on subsequent requests in the same worker
  if (isConnected) return;

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    isConnected = true;
    console.log("✅ PostgreSQL connected successfully");
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  connectDatabase,
};