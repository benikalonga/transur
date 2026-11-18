/**
 * Transur database schema (MySQL 8). This file is the single source of truth:
 * `npm run db:migrate` creates every table below and seeds the fare rules.
 */

const TABLE_OPTS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const tables = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id             CHAR(36)     PRIMARY KEY,
      phone          VARCHAR(20)  NOT NULL UNIQUE,
      full_name      VARCHAR(100) NOT NULL,
      email          VARCHAR(150),
      role           ENUM('rider','driver','courier') NOT NULL,
      account_status ENUM('active','suspended','banned') NOT NULL DEFAULT 'active',
      avatar_url     VARCHAR(255),
      referral_code  VARCHAR(12)  NOT NULL UNIQUE,
      referred_by    CHAR(36),
      push_token     VARCHAR(255),
      last_active_at DATETIME,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX ix_users_role (role),
      INDEX ix_users_status (account_status)
    ) ${TABLE_OPTS}`,

  login_codes: `
    CREATE TABLE IF NOT EXISTS login_codes (
      id          CHAR(36)    PRIMARY KEY,
      phone       VARCHAR(20) NOT NULL,
      code_hash   CHAR(64)    NOT NULL,
      expires_at  DATETIME    NOT NULL,
      consumed    TINYINT(1)  NOT NULL DEFAULT 0,
      attempts    INT         NOT NULL DEFAULT 0,
      created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ix_codes_phone (phone, consumed)
    ) ${TABLE_OPTS}`,

  fleet_profiles: `
    CREATE TABLE IF NOT EXISTS fleet_profiles (
      user_id         CHAR(36)    PRIMARY KEY,
      vehicle_class   VARCHAR(20) NOT NULL,
      vehicle_make    VARCHAR(60),
      vehicle_color   VARCHAR(40),
      plate_number    VARCHAR(20),
      licence_number  VARCHAR(40),
      availability    ENUM('offline','online','busy') NOT NULL DEFAULT 'offline',
      rating_avg      DECIMAL(3,2) NOT NULL DEFAULT 5.00,
      rating_count    INT          NOT NULL DEFAULT 0,
      jobs_completed  INT          NOT NULL DEFAULT 0,
      is_verified     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_fleet_availability (availability)
    ) ${TABLE_OPTS}`,

  fleet_positions: `
    CREATE TABLE IF NOT EXISTS fleet_positions (
      user_id     CHAR(36)      PRIMARY KEY,
      lat         DECIMAL(10,7) NOT NULL,
      lng         DECIMAL(10,7) NOT NULL,
      heading     DECIMAL(5,2),
      speed       DECIMAL(6,2),
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_positions_updated (updated_at)
    ) ${TABLE_OPTS}`,

  fare_rules: `
    CREATE TABLE IF NOT EXISTS fare_rules (
      id               CHAR(36)     PRIMARY KEY,
      service          ENUM('ride','parcel') NOT NULL,
      vehicle_class    VARCHAR(20)  NOT NULL,
      city             VARCHAR(50)  NOT NULL DEFAULT 'default',
      label            VARCHAR(60)  NOT NULL,
      base_fare        DECIMAL(10,2) NOT NULL,
      per_km           DECIMAL(10,2) NOT NULL,
      per_minute       DECIMAL(10,2) NOT NULL DEFAULT 0,
      minimum_fare     DECIMAL(10,2) NOT NULL,
      surge_multiplier DECIMAL(4,2)  NOT NULL DEFAULT 1.00,
      commission_pct   DECIMAL(5,2)  NOT NULL DEFAULT 15.00,
      seats            INT           NOT NULL DEFAULT 4,
      is_active        TINYINT(1)    NOT NULL DEFAULT 1,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_rule (service, vehicle_class, city)
    ) ${TABLE_OPTS}`,

  promo_codes: `
    CREATE TABLE IF NOT EXISTS promo_codes (
      id               CHAR(36)     PRIMARY KEY,
      code             VARCHAR(30)  NOT NULL UNIQUE,
      description      VARCHAR(200),
      discount_type    ENUM('percent','flat') NOT NULL,
      discount_value   DECIMAL(10,2) NOT NULL,
      max_discount     DECIMAL(10,2),
      min_fare         DECIMAL(10,2) NOT NULL DEFAULT 0,
      service          ENUM('any','ride','parcel') NOT NULL DEFAULT 'any',
      usage_limit      INT,
      per_user_limit   INT NOT NULL DEFAULT 1,
      times_used       INT NOT NULL DEFAULT 0,
      owner_user_id    CHAR(36),
      starts_at        DATETIME,
      expires_at       DATETIME,
      is_active        TINYINT(1) NOT NULL DEFAULT 1,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,

  bookings: `
    CREATE TABLE IF NOT EXISTS bookings (
      id                 CHAR(36)    PRIMARY KEY,
      service            ENUM('ride','parcel') NOT NULL,
      vehicle_class      VARCHAR(20) NOT NULL,
      rider_id           CHAR(36)    NOT NULL,
      provider_id        CHAR(36),

      pickup_address     VARCHAR(255)  NOT NULL,
      pickup_lat         DECIMAL(10,7) NOT NULL,
      pickup_lng         DECIMAL(10,7) NOT NULL,
      dropoff_address    VARCHAR(255)  NOT NULL,
      dropoff_lat        DECIMAL(10,7) NOT NULL,
      dropoff_lng        DECIMAL(10,7) NOT NULL,
      rider_note         VARCHAR(255),

      sender_name        VARCHAR(100),
      sender_phone       VARCHAR(20),
      recipient_name     VARCHAR(100),
      recipient_phone    VARCHAR(20),
      parcel_details     VARCHAR(255),
      parcel_size        ENUM('small','medium','large'),
      handover_pin       CHAR(4),

      distance_km        DECIMAL(8,2) NOT NULL,
      duration_min       INT          NOT NULL,
      quoted_fare        DECIMAL(10,2) NOT NULL,
      floor_fare         DECIMAL(10,2) NOT NULL,
      rider_offer        DECIMAL(10,2) NOT NULL,
      agreed_fare        DECIMAL(10,2),
      commission_pct     DECIMAL(5,2)  NOT NULL,
      promo_code_id      CHAR(36),
      discount_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
      final_fare         DECIMAL(10,2),
      platform_fee       DECIMAL(10,2),
      provider_payout    DECIMAL(10,2),
      tip_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,

      status             ENUM('scheduled','searching','assigned','arrived','in_progress','completed','cancelled')
                         NOT NULL DEFAULT 'searching',
      payment_method     VARCHAR(20) NOT NULL DEFAULT 'cash',
      payment_status     ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',

      scheduled_for      DATETIME,
      broadcast_at       DATETIME,
      assigned_at        DATETIME,
      arrived_at         DATETIME,
      started_at         DATETIME,
      completed_at       DATETIME,
      cancelled_at       DATETIME,
      cancelled_by       ENUM('rider','provider','system','staff'),
      cancel_reason      VARCHAR(255),

      rider_rating       TINYINT,
      rider_feedback     VARCHAR(500),
      provider_rating    TINYINT,

      share_token        CHAR(32) UNIQUE,
      created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (rider_id)      REFERENCES users(id),
      FOREIGN KEY (provider_id)   REFERENCES users(id),
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL,
      INDEX ix_bookings_rider (rider_id, created_at),
      INDEX ix_bookings_provider (provider_id, created_at),
      INDEX ix_bookings_status (status),
      INDEX ix_bookings_schedule (status, scheduled_for)
    ) ${TABLE_OPTS}`,

  booking_bids: `
    CREATE TABLE IF NOT EXISTS booking_bids (
      id           CHAR(36)      PRIMARY KEY,
      booking_id   CHAR(36)      NOT NULL,
      provider_id  CHAR(36)      NOT NULL,
      amount       DECIMAL(10,2) NOT NULL,
      eta_min      INT,
      status       ENUM('open','won','lost','withdrawn','expired') NOT NULL DEFAULT 'open',
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_bid (booking_id, provider_id),
      FOREIGN KEY (booking_id)  REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id)    ON DELETE CASCADE
    ) ${TABLE_OPTS}`,

  promo_redemptions: `
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id            CHAR(36)      PRIMARY KEY,
      promo_code_id CHAR(36)      NOT NULL,
      user_id       CHAR(36)      NOT NULL,
      booking_id    CHAR(36)      NOT NULL UNIQUE,
      amount        DECIMAL(10,2) NOT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
      FOREIGN KEY (booking_id)    REFERENCES bookings(id)    ON DELETE CASCADE,
      INDEX ix_redemptions_user (user_id, promo_code_id)
    ) ${TABLE_OPTS}`,

  dispatch_log: `
    CREATE TABLE IF NOT EXISTS dispatch_log (
      id           BIGINT AUTO_INCREMENT PRIMARY KEY,
      booking_id   CHAR(36)     NOT NULL,
      provider_id  CHAR(36)     NOT NULL,
      distance_km  DECIMAL(8,2),
      sent_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ix_dispatch_booking (booking_id)
    ) ${TABLE_OPTS}`,

  wallets: `
    CREATE TABLE IF NOT EXISTS wallets (
      user_id       CHAR(36)      PRIMARY KEY,
      balance       DECIMAL(12,2) NOT NULL DEFAULT 0,
      debt_limit    DECIMAL(10,2) NOT NULL DEFAULT -5.00,
      is_locked     TINYINT(1)    NOT NULL DEFAULT 0,
      lock_reason   ENUM('debt','staff'),
      lifetime_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
      lifetime_topups   DECIMAL(12,2) NOT NULL DEFAULT 0,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,

  wallet_entries: `
    CREATE TABLE IF NOT EXISTS wallet_entries (
      id             CHAR(36)      PRIMARY KEY,
      user_id        CHAR(36)      NOT NULL,
      kind           ENUM('commission','payout','top_up','tip','promo_credit','adjustment','refund') NOT NULL,
      amount         DECIMAL(12,2) NOT NULL,
      balance_after  DECIMAL(12,2) NOT NULL,
      memo           VARCHAR(255),
      booking_id     CHAR(36),
      external_ref   VARCHAR(100),
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_entries_user (user_id, created_at)
    ) ${TABLE_OPTS}`,

  payment_intents: `
    CREATE TABLE IF NOT EXISTS payment_intents (
      id            CHAR(36)      PRIMARY KEY,
      user_id       CHAR(36)      NOT NULL,
      purpose       ENUM('wallet_top_up','tip') NOT NULL,
      provider      VARCHAR(20)   NOT NULL,
      payer_phone   VARCHAR(20),
      amount        DECIMAL(12,2) NOT NULL,
      status        ENUM('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
      provider_ref  VARCHAR(100)  UNIQUE,
      booking_id    CHAR(36),
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      settled_at    DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,

  saved_places: `
    CREATE TABLE IF NOT EXISTS saved_places (
      id          CHAR(36)      PRIMARY KEY,
      user_id     CHAR(36)      NOT NULL,
      label       VARCHAR(40)   NOT NULL,
      kind        ENUM('home','work','other') NOT NULL DEFAULT 'other',
      address     VARCHAR(255)  NOT NULL,
      lat         DECIMAL(10,7) NOT NULL,
      lng         DECIMAL(10,7) NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_places_user (user_id)
    ) ${TABLE_OPTS}`,

  trusted_contacts: `
    CREATE TABLE IF NOT EXISTS trusted_contacts (
      id          CHAR(36)     PRIMARY KEY,
      user_id     CHAR(36)     NOT NULL,
      name        VARCHAR(100) NOT NULL,
      phone       VARCHAR(20)  NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_contacts_user (user_id)
    ) ${TABLE_OPTS}`,

  sos_alerts: `
    CREATE TABLE IF NOT EXISTS sos_alerts (
      id           CHAR(36)      PRIMARY KEY,
      user_id      CHAR(36)      NOT NULL,
      booking_id   CHAR(36),
      lat          DECIMAL(10,7),
      lng          DECIMAL(10,7),
      message      VARCHAR(255),
      status       ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
      handled_by   CHAR(36),
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at  DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_sos_status (status)
    ) ${TABLE_OPTS}`,

  booking_messages: `
    CREATE TABLE IF NOT EXISTS booking_messages (
      id          CHAR(36)     PRIMARY KEY,
      booking_id  CHAR(36)     NOT NULL,
      sender_id   CHAR(36)     NOT NULL,
      body        VARCHAR(1000) NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      INDEX ix_messages_booking (booking_id, created_at)
    ) ${TABLE_OPTS}`,

  notifications: `
    CREATE TABLE IF NOT EXISTS notifications (
      id          CHAR(36)     PRIMARY KEY,
      user_id     CHAR(36)     NOT NULL,
      title       VARCHAR(150) NOT NULL,
      body        VARCHAR(500) NOT NULL,
      category    VARCHAR(30)  NOT NULL DEFAULT 'general',
      booking_id  CHAR(36),
      read_at     DATETIME,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_notifications_user (user_id, read_at)
    ) ${TABLE_OPTS}`,

  staff: `
    CREATE TABLE IF NOT EXISTS staff (
      id             CHAR(36)     PRIMARY KEY,
      email          VARCHAR(190) NOT NULL UNIQUE,
      full_name      VARCHAR(100) NOT NULL,
      password_hash  VARCHAR(100) NOT NULL,
      role           ENUM('owner','agent') NOT NULL DEFAULT 'agent',
      access_status  ENUM('pending','active','rejected') NOT NULL DEFAULT 'pending',
      approved_by    CHAR(36),
      last_login_at  DATETIME,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ${TABLE_OPTS}`,

  help_threads: `
    CREATE TABLE IF NOT EXISTS help_threads (
      id               CHAR(36)     PRIMARY KEY,
      user_id          CHAR(36)     NOT NULL,
      staff_id         CHAR(36),
      topic            VARCHAR(150) NOT NULL DEFAULT 'General help',
      state            ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
      last_message     VARCHAR(500),
      last_message_at  DATETIME,
      unread_staff     INT NOT NULL DEFAULT 0,
      unread_user      INT NOT NULL DEFAULT 0,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX ix_threads_user (user_id)
    ) ${TABLE_OPTS}`,

  help_messages: `
    CREATE TABLE IF NOT EXISTS help_messages (
      id           CHAR(36)     PRIMARY KEY,
      thread_id    CHAR(36)     NOT NULL,
      author_type  ENUM('user','staff') NOT NULL,
      author_id    CHAR(36)     NOT NULL,
      author_name  VARCHAR(100) NOT NULL,
      body         VARCHAR(2000) NOT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES help_threads(id) ON DELETE CASCADE,
      INDEX ix_help_thread (thread_id, created_at)
    ) ${TABLE_OPTS}`,
};

/**
 * Default fare rules. Amounts are in the platform base currency (USD by default)
 * and can be edited from the console.
 */
const fareSeeds = [
  // service, class,    label,              base, perKm, perMin, minimum, commission, seats
  ['ride',   'moto',    'Moto',              0.80, 0.30, 0.03, 1.00, 12, 1],
  ['ride',   'economy', 'Economy',           1.50, 0.45, 0.05, 2.00, 15, 4],
  ['ride',   'comfort', 'Comfort',           2.50, 0.65, 0.08, 3.50, 18, 4],
  ['ride',   'xl',      'XL (6 seats)',      3.00, 0.80, 0.10, 4.50, 18, 6],
  ['parcel', 'standard','Standard delivery', 1.20, 0.35, 0.00, 1.50, 15, 0],
];

module.exports = { tables, fareSeeds };
