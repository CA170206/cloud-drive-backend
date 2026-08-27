const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("Unexpected database error:", error);
});

const connectDatabase = async () => {
  try {
    const client = await pool.connect();

    const result = await client.query("SELECT NOW() AS current_time");

    console.log("✅ PostgreSQL connected successfully");
    console.log(`🕐 Database time: ${result.rows[0].current_time}`);

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