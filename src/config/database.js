const { Pool } = require("pg");

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing from .env");
  process.exit(1);
}

let dbUrl;

try {
  dbUrl = new URL(process.env.DATABASE_URL);
} catch (error) {
  console.error("❌ Invalid DATABASE_URL in .env");
  console.error(error.message);
  process.exit(1);
}

const pool = new Pool({
  host: dbUrl.hostname,
  port: dbUrl.port
    ? Number(dbUrl.port)
    : 5432,
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

const connectDatabase = async () => {
  try {
    const client = await pool.connect();

    const result = await client.query(
      "SELECT NOW() AS current_time"
    );

    console.log("✅ PostgreSQL connected successfully");
    console.log(
      "🕒 Database time:",
      result.rows[0].current_time
    );

    client.release();
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
};

module.exports = {
  pool,
  connectDatabase,
};