const mysql = require('mysql2/promise');
const { randomUUID: uuid } = require('crypto');
const env = require('../config/env');
const { tables, fareSeeds } = require('./schema');

async function migrate() {
  const conn = await mysql.createConnection({
    ...env.db.connection(),
    multipleStatements: false,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${env.db.name}\``);
    console.log(`• database "${env.db.name}" ready`);

    for (const [name, ddl] of Object.entries(tables)) {
      await conn.query(ddl);
      console.log(`  ✓ ${name}`);
    }

    let seeded = 0;
    for (const [service, vclass, label, base, perKm, perMin, minimum, commission, seats] of fareSeeds) {
      const [result] = await conn.query(
        `INSERT IGNORE INTO fare_rules
           (id, service, vehicle_class, city, label, base_fare, per_km, per_minute, minimum_fare, commission_pct, seats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), service, vclass, env.defaultCity, label, base, perKm, perMin, minimum, commission, seats]
      );
      seeded += result.affectedRows;
    }
    console.log(`• fare rules: ${seeded} inserted, ${fareSeeds.length - seeded} already present`);
    console.log('✓ migration complete');
  } finally {
    await conn.end();
  }
}

migrate().catch((err) => {
  console.error('✖ migration failed:', err.message);
  process.exit(1);
});
