-- =============================================================================
-- TRANSUR DATABASE SCHEMA — MySQL 8.0+
-- Platform: Ride-hailing & Delivery for DRC (Lubumbashi pilot)
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- OTP
-- =============================================================================

CREATE TABLE IF NOT EXISTS otp_codes (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- DRIVER PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS driver_profiles (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- DELIVERY AGENT PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS delivery_profiles (
    id                  VARCHAR(36) PRIMARY KEY,
    user_id             VARCHAR(36) NOT NULL UNIQUE,
    transport_type      ENUM('moto','velo','pied','voiture') NOT NULL,
    vehicle_plate       VARCHAR(20),
    vehicle_color       VARCHAR(50),
    vehicle_brand       VARCHAR(50),
    status              ENUM('offline','online','busy') NOT NULL DEFAULT 'offline',
    rating              DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    total_deliveries    INT NOT NULL DEFAULT 0,
    is_verified         TINYINT(1) NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- DRIVER LOCATIONS (real-time GPS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS driver_locations (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL UNIQUE,
    latitude    DECIMAL(10,7) NOT NULL,
    longitude   DECIMAL(10,7) NOT NULL,
    heading     DECIMAL(5,2),
    speed       DECIMAL(5,2),
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_dl_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- PRICING CONFIGURATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS pricing_config (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TRIPS (Taxi)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trips (
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

    -- InDrive-style negotiated pricing
    client_offered_price  DECIMAL(10,2),
    recommended_price     DECIMAL(10,2),
    min_price             DECIMAL(10,2),
    final_agreed_price    DECIMAL(10,2),

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

    client_rating       TINYINT CHECK (client_rating BETWEEN 1 AND 5),
    driver_rating       TINYINT CHECK (driver_rating BETWEEN 1 AND 5),
    client_comment      TEXT,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (driver_id) REFERENCES users(id),
    INDEX idx_trips_client (client_id),
    INDEX idx_trips_driver (driver_id),
    INDEX idx_trips_status (status),
    INDEX idx_trips_requested (requested_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TRIP OFFERS  (InDrive-style price negotiation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trip_offers (
    id              VARCHAR(36) PRIMARY KEY,
    trip_id         VARCHAR(36) NOT NULL,
    driver_id       VARCHAR(36) NOT NULL,
    offered_price   DECIMAL(10,2) NOT NULL,
    status          ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_trip_driver (trip_id, driver_id),
    FOREIGN KEY (trip_id)   REFERENCES trips(id)  ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES users(id)  ON DELETE CASCADE,
    INDEX idx_trip_offers_trip   (trip_id),
    INDEX idx_trip_offers_driver (driver_id),
    INDEX idx_trip_offers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- DELIVERIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS deliveries (
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

    client_rating           TINYINT CHECK (client_rating BETWEEN 1 AND 5),
    agent_rating            TINYINT CHECK (agent_rating BETWEEN 1 AND 5),

    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (agent_id) REFERENCES users(id),
    INDEX idx_deliveries_client (client_id),
    INDEX idx_deliveries_agent (agent_id),
    INDEX idx_deliveries_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- WALLETS
-- =============================================================================

CREATE TABLE IF NOT EXISTS wallets (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL UNIQUE,
    balance     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    debt_limit  DECIMAL(10,2) NOT NULL DEFAULT -5.00,
    is_blocked  TINYINT(1) NOT NULL DEFAULT 0,
    total_earned DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_paid  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- WALLET TRANSACTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              VARCHAR(36) PRIMARY KEY,
    wallet_id       VARCHAR(36) NOT NULL,
    user_id         VARCHAR(36) NOT NULL,
    type            ENUM('commission_debit','mobile_money_credit','bonus','penalty','withdrawal','refund') NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    balance_before  DECIMAL(12,2) NOT NULL,
    balance_after   DECIMAL(12,2) NOT NULL,
    description     TEXT,
    reference_id    VARCHAR(36),
    reference_type  VARCHAR(20),
    mobile_money_ref VARCHAR(100),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_wt_user (user_id),
    INDEX idx_wt_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- MOBILE MONEY TRANSACTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS mobile_money_transactions (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36),
    provider        ENUM('cash','mpesa','airtel_money','orange_money','vodacom') NOT NULL,
    phone_number    VARCHAR(20) NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(5) NOT NULL DEFAULT 'USD',
    direction       ENUM('inbound','outbound') NOT NULL,
    status          ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
    provider_ref    VARCHAR(100),
    reference_id    VARCHAR(36),
    reference_type  VARCHAR(20),
    initiated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    error_message   TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- BROADCAST LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS broadcast_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36),
    title       VARCHAR(200) NOT NULL,
    body        TEXT NOT NULL,
    type        VARCHAR(50),
    data        JSON,
    is_read     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SUPPORT TICKETS
-- =============================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36),
    reference_id    VARCHAR(36),
    reference_type  VARCHAR(20),
    category        VARCHAR(50),
    subject         VARCHAR(200) NOT NULL,
    description     TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
    resolved_at     DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS create_user_wallet;
DELIMITER //
CREATE TRIGGER create_user_wallet
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    IF NEW.role IN ('driver', 'delivery') THEN
        INSERT INTO wallets (id, user_id) VALUES (UUID(), NEW.id);
    END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS check_wallet_block;
DELIMITER //
CREATE TRIGGER check_wallet_block
BEFORE UPDATE ON wallets
FOR EACH ROW
BEGIN
    IF NEW.balance <= NEW.debt_limit THEN
        SET NEW.is_blocked = 1;
    ELSEIF NEW.balance > -1.00 THEN
        SET NEW.is_blocked = 0;
    END IF;
END//
DELIMITER ;

-- =============================================================================
-- ADMIN & SUPPORT TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS `admins` (
  `id` varchar(36) NOT NULL DEFAULT (uuid()),
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL DEFAULT '',
  `name` varchar(100) NOT NULL,
  `role` enum('superadmin','admin') DEFAULT 'admin',
  `status` enum('pending','active','rejected') DEFAULT 'pending',
  `approved_by` varchar(36) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `admins_ibfk_1` FOREIGN KEY (`approved_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_conversations` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigned_admin_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(255) DEFAULT 'Support',
  `status` enum('open','assigned','resolved','closed') DEFAULT 'open',
  `last_message` text,
  `last_message_at` datetime DEFAULT NULL,
  `unread_admin` int DEFAULT '0',
  `unread_user` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_messages` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `conversation_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `admin_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sender_type` enum('admin','user') NOT NULL,
  `sender_name` varchar(100) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversation` (`conversation_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SEED DATA
-- =============================================================================

INSERT IGNORE INTO pricing_config (id, service_type, city, base_fare, per_km_rate, minimum_fare, commission_rate)
VALUES
    (UUID(), 'taxi',     'lubumbashi', 2.00, 0.50, 2.00, 15.0),
    (UUID(), 'delivery', 'lubumbashi', 1.50, 0.40, 1.50, 15.0);
