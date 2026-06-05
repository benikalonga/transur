require('dotenv').config();
const mysql = require('mysql2/promise');

// =============================================================================
// Toutes les instructions DDL + DML définies directement ici
// (évite les problèmes de parsing fichier .sql)
// =============================================================================

const TABLES = [
`CREATE TABLE IF NOT EXISTS users (
    id          VARCHAR(36) PRIMARY KEY,
    phone       VARCHAR(20) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    role        ENUM('client','driver','delivery','admin') NOT NULL,
    status      ENUM('pending','active','suspended','blocked') NOT NULL DEFAULT 'pending',
    photo_url   TEXT,
    fcm_token   TEXT,
    last_seen   DATETIME,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_phone (phone),
    INDEX idx_users_role (role),
    INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS otp_codes (
    id          VARCHAR(36) PRIMARY KEY,
    phone       VARCHAR(20) NOT NULL,
    code        VARCHAR(6) NOT NULL,
    purpose     ENUM('register','login','reset') NOT NULL,
    expires_at  DATETIME NOT NULL,
    used        TINYINT(1) NOT NULL DEFAULT 0,
    attempts    INT NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_phone (phone),
    INDEX idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS driver_profiles (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL UNIQUE,
    vehicle_type    ENUM('moto','tricycle','minibus','berline','suv','4x4') NOT NULL,
    vehicle_plate   VARCHAR(20),
    vehicle_color   VARCHAR(50),
    vehicle_brand   VARCHAR(50),
    license_number  VARCHAR(50),
    status          ENUM('offline','online','busy') NOT NULL DEFAULT 'offline',
    rating          DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    total_trips     INT NOT NULL DEFAULT 0,
    is_verified     TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS delivery_profiles (
    id                  VARCHAR(36) PRIMARY KEY,
    user_id             VARCHAR(36) NOT NULL UNIQUE,
    transport_type      ENUM('moto','velo','pied') NOT NULL,
    status              ENUM('offline','online','busy') NOT NULL DEFAULT 'offline',
    rating              DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    total_deliveries    INT NOT NULL DEFAULT 0,
    is_verified         TINYINT(1) NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS driver_locations (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL UNIQUE,
    latitude    DECIMAL(10,7) NOT NULL,
    longitude   DECIMAL(10,7) NOT NULL,
    heading     DECIMAL(5,2),
    speed       DECIMAL(5,2),
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_dl_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS pricing_config (
    id                  VARCHAR(36) PRIMARY KEY,
    service_type        VARCHAR(20) NOT NULL,
    city                VARCHAR(50) NOT NULL DEFAULT 'lubumbashi',
    base_fare           DECIMAL(10,2) NOT NULL,
    per_km_rate         DECIMAL(10,2) NOT NULL,
    per_min_rate        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    minimum_fare        DECIMAL(10,2) NOT NULL,
    surge_multiplier    DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    commission_rate     DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS trips (
    id                  VARCHAR(36) PRIMARY KEY,
    client_id           VARCHAR(36),
    driver_id           VARCHAR(36),
    pickup_address      TEXT NOT NULL,
    pickup_lat          DECIMAL(10,7) NOT NULL,
    pickup_lng          DECIMAL(10,7) NOT NULL,
    dropoff_address     TEXT NOT NULL,
    dropoff_lat         DECIMAL(10,7) NOT NULL,
    dropoff_lng         DECIMAL(10,7) NOT NULL,
    estimated_distance  DECIMAL(8,2),
    estimated_duration  INT,
    estimated_fare      DECIMAL(10,2),
    actual_distance     DECIMAL(8,2),
    actual_duration     INT,
    final_fare          DECIMAL(10,2),
    commission_amount   DECIMAL(10,2),
    driver_earnings     DECIMAL(10,2),
    status              ENUM('pending','broadcast','accepted','pickup','ongoing','completed','cancelled') NOT NULL DEFAULT 'pending',
    payment_method      ENUM('cash','mpesa','airtel_money','orange_money','vodacom') NOT NULL DEFAULT 'cash',
    payment_status      ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
    requested_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at         DATETIME,
    pickup_at           DATETIME,
    started_at          DATETIME,
    completed_at        DATETIME,
    cancelled_at        DATETIME,
    cancel_reason       TEXT,
    client_rating       TINYINT,
    driver_rating       TINYINT,
    client_comment      TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (driver_id) REFERENCES users(id),
    INDEX idx_trips_client (client_id),
    INDEX idx_trips_driver (driver_id),
    INDEX idx_trips_status (status),
    INDEX idx_trips_requested (requested_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS deliveries (
    id                      VARCHAR(36) PRIMARY KEY,
    client_id               VARCHAR(36),
    agent_id                VARCHAR(36),
    pickup_address          TEXT NOT NULL,
    pickup_lat              DECIMAL(10,7) NOT NULL,
    pickup_lng              DECIMAL(10,7) NOT NULL,
    pickup_contact_name     VARCHAR(100),
    pickup_contact_phone    VARCHAR(20),
    dropoff_address         TEXT NOT NULL,
    dropoff_lat             DECIMAL(10,7) NOT NULL,
    dropoff_lng             DECIMAL(10,7) NOT NULL,
    recipient_name          VARCHAR(100),
    recipient_phone         VARCHAR(20),
    package_description     TEXT,
    package_size            VARCHAR(20) NOT NULL DEFAULT 'small',
    special_instructions    TEXT,
    estimated_distance      DECIMAL(8,2),
    estimated_fare          DECIMAL(10,2),
    final_fare              DECIMAL(10,2),
    commission_amount       DECIMAL(10,2),
    agent_earnings          DECIMAL(10,2),
    status                  ENUM('pending','broadcast','accepted','pickup','ongoing','delivered','cancelled') NOT NULL DEFAULT 'pending',
    payment_method          ENUM('cash','mpesa','airtel_money','orange_money','vodacom') NOT NULL DEFAULT 'cash',
    payment_status          ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
    requested_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at             DATETIME,
    pickup_at               DATETIME,
    delivered_at            DATETIME,
    cancelled_at            DATETIME,
    cancel_reason           TEXT,
    client_rating           TINYINT,
    agent_rating            TINYINT,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (agent_id)  REFERENCES users(id),
    INDEX idx_deliveries_client (client_id),
    INDEX idx_deliveries_agent (agent_id),
    INDEX idx_deliveries_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS wallets (
    id           VARCHAR(36) PRIMARY KEY,
    user_id      VARCHAR(36) NOT NULL UNIQUE,
    balance      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    debt_limit   DECIMAL(10,2) NOT NULL DEFAULT -5.00,
    is_blocked   TINYINT(1) NOT NULL DEFAULT 0,
    total_earned DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_paid   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS wallet_transactions (
    id               VARCHAR(36) PRIMARY KEY,
    wallet_id        VARCHAR(36) NOT NULL,
    user_id          VARCHAR(36) NOT NULL,
    type             ENUM('commission_debit','mobile_money_credit','bonus','penalty','withdrawal','refund') NOT NULL,
    amount           DECIMAL(12,2) NOT NULL,
    balance_before   DECIMAL(12,2) NOT NULL,
    balance_after    DECIMAL(12,2) NOT NULL,
    description      TEXT,
    reference_id     VARCHAR(36),
    reference_type   VARCHAR(20),
    mobile_money_ref VARCHAR(100),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (user_id)   REFERENCES users(id),
    INDEX idx_wt_user (user_id),
    INDEX idx_wt_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS mobile_money_transactions (
    id             VARCHAR(36) PRIMARY KEY,
    user_id        VARCHAR(36),
    provider       ENUM('cash','mpesa','airtel_money','orange_money','vodacom') NOT NULL,
    phone_number   VARCHAR(20) NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    currency       VARCHAR(5) NOT NULL DEFAULT 'USD',
    direction      ENUM('inbound','outbound') NOT NULL,
    status         ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
    provider_ref   VARCHAR(100),
    reference_id   VARCHAR(36),
    reference_type VARCHAR(20),
    initiated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at   DATETIME,
    error_message  TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS broadcast_logs (
    id              VARCHAR(36) PRIMARY KEY,
    request_id      VARCHAR(36) NOT NULL,
    request_type    VARCHAR(20) NOT NULL,
    driver_id       VARCHAR(36),
    status          VARCHAR(20) NOT NULL DEFAULT 'sent',
    sent_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at    DATETIME,
    response_time_ms INT,
    FOREIGN KEY (driver_id) REFERENCES users(id),
    INDEX idx_bl_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS notifications (
    id         VARCHAR(36) PRIMARY KEY,
    user_id    VARCHAR(36),
    title      VARCHAR(200) NOT NULL,
    body       TEXT NOT NULL,
    type       VARCHAR(50),
    data       JSON,
    is_read    TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS support_tickets (
    id             VARCHAR(36) PRIMARY KEY,
    user_id        VARCHAR(36),
    reference_id   VARCHAR(36),
    reference_type VARCHAR(20),
    category       VARCHAR(50),
    subject        VARCHAR(200) NOT NULL,
    description    TEXT NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'open',
    resolved_at    DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// Triggers (exécutés avec query(), pas execute())
const TRIGGERS = [
`DROP TRIGGER IF EXISTS create_user_wallet`,
`CREATE TRIGGER create_user_wallet
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    IF NEW.role IN ('driver', 'delivery') THEN
        INSERT INTO wallets (id, user_id) VALUES (UUID(), NEW.id);
    END IF;
END`,

`DROP TRIGGER IF EXISTS check_wallet_block`,
`CREATE TRIGGER check_wallet_block
BEFORE UPDATE ON wallets
FOR EACH ROW
BEGIN
    IF NEW.balance <= NEW.debt_limit THEN
        SET NEW.is_blocked = 1;
    ELSEIF NEW.balance > -1.00 THEN
        SET NEW.is_blocked = 0;
    END IF;
END`,
];

// Seed data
const SEEDS = [
`INSERT IGNORE INTO pricing_config (id, service_type, city, base_fare, per_km_rate, minimum_fare, commission_rate)
 VALUES (UUID(), 'taxi', 'lubumbashi', 2.00, 0.50, 2.00, 15.0)`,
`INSERT IGNORE INTO pricing_config (id, service_type, city, base_fare, per_km_rate, minimum_fare, commission_rate)
 VALUES (UUID(), 'delivery', 'lubumbashi', 1.50, 0.40, 1.50, 15.0)`,
];

async function migrate() {
  const db = process.env.DATABASE_NAME || 'transur';

  const conn = await mysql.createConnection({
    host:     process.env.DATABASE_HOST     || 'localhost',
    port:     parseInt(process.env.DATABASE_PORT || '3306'),
    user:     process.env.DATABASE_USERNAME || 'root',
    password: process.env.DATABASE_PASSWORD || '',
  });

  try {
    // 1. Créer la DB
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${db}\``);
    console.log(`✅ Base de données "${db}" sélectionnée\n`);

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // 2. Tables
    console.log('📋 Création des tables...');
    for (const sql of TABLES) {
      const name = (sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i) || [])[1] || '?';
      try {
        await conn.query(sql);
        console.log(`  ✅ ${name}`);
      } catch (err) {
        console.log(`  ⚠️  ${name}: ${err.message.slice(0, 60)}`);
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // 3. Triggers
    console.log('\n⚡ Création des triggers...');
    for (const sql of TRIGGERS) {
      const name = (sql.match(/TRIGGER (\w+)/i) || sql.match(/DROP TRIGGER IF EXISTS (\w+)/i) || [])[1] || sql.slice(0, 30);
      try {
        await conn.query(sql);
        console.log(`  ✅ ${name}`);
      } catch (err) {
        console.log(`  ⚠️  ${name}: ${err.message.slice(0, 60)}`);
      }
    }

    // 4. Seed
    console.log('\n🌱 Données initiales (tarifs)...');
    for (const sql of SEEDS) {
      try {
        const [result] = await conn.query(sql);
        if (result.affectedRows > 0) console.log('  ✅ Tarif inséré');
        else console.log('  ℹ️  Tarif déjà présent');
      } catch (err) {
        console.log(`  ⚠️  Seed: ${err.message.slice(0, 60)}`);
      }
    }

    console.log('\n🎉 Migration terminée avec succès !');
    console.log(`   Base: ${db} | Tables: ${TABLES.length} | Triggers: ${TRIGGERS.filter(t => t.includes('CREATE TRIGGER')).length}`);

  } finally {
    await conn.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌', err.message); process.exit(1); });
