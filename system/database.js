
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("RICO: DATABASE_URL غير موجود في Environment.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS rico_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
  )
`);

const result = await pool.query(
  "SELECT data FROM rico_state WHERE id = 1"
);

const database = result.rows[0]?.data || {};

global.db = database;
global.db.settings ||= {};
global.db.settings.installLimit ??= 10;

let saveQueue = Promise.resolve();

global.saveDB = () => {
  const snapshot = JSON.stringify(global.db);

  saveQueue = saveQueue.then(async () => {
    await pool.query(
      `INSERT INTO rico_state (id, data)
       VALUES (1, $1::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data`,
      [snapshot]
    );
    return true;
  });

  return saveQueue;
};

console.log("RICO PostgreSQL database connected.");
