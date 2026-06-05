const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DATABASE_HOST     || 'localhost',
  port:               parseInt(process.env.DATABASE_PORT || '3306'),
  database:           process.env.DATABASE_NAME     || 'transur',
  user:               process.env.DATABASE_USERNAME || 'root',
  password:           process.env.DATABASE_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           'Z',          // Force UTC — évite les décalages horaires
});

// Unified query helper — returns { rows } like pg for compatibility
const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return { rows: Array.isArray(rows) ? rows : [] };
};

// Transaction helper — passes a client with .query()
const transaction = async (callback) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const client = {
      query: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return { rows: Array.isArray(rows) ? rows : [] };
      },
    };
    const result = await callback(client);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const testConnection = async () => {
  try {
    await pool.execute('SELECT 1');
    console.log('✅ MySQL connecté');
  } catch (err) {
    console.error('❌ MySQL erreur de connexion:', err.message);
    process.exit(1);
  }
};

module.exports = { query, transaction, pool, testConnection };
