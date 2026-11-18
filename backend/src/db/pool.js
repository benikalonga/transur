const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  ...env.db.connection(),
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: 20,
  charset: 'utf8mb4',
  timezone: 'Z', // store and read everything in UTC
  decimalNumbers: true, // DECIMAL columns come back as JS numbers
});

/** Run a statement and return the rows (or the result header for writes). */
const sql = async (statement, params = []) => {
  const [rows] = await pool.execute(statement, params);
  return rows;
};

/** Return the first row or null. */
const one = async (statement, params = []) => {
  const rows = await sql(statement, params);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

/**
 * Run `work(db)` inside a transaction. `db` exposes the same `sql` / `one`
 * helpers bound to a single connection.
 */
const withTransaction = async (work) => {
  const conn = await pool.getConnection();
  const db = {
    sql: async (statement, params = []) => (await conn.execute(statement, params))[0],
    one: async (statement, params = []) => {
      const [rows] = await conn.execute(statement, params);
      return rows.length ? rows[0] : null;
    },
  };
  try {
    await conn.beginTransaction();
    const result = await work(db);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const ping = async () => {
  await pool.execute('SELECT 1');
};

module.exports = { pool, sql, one, withTransaction, ping };
