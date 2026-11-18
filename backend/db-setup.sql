-- One-time database setup for local development (MariaDB 10.6+ or MySQL 8).
-- Run it as a database admin, for example:
--   sudo mariadb < backend/db-setup.sql        (MariaDB, root signs in through the socket)
--   mysql -u root -p < backend/db-setup.sql    (MySQL)
-- Then put the same password in backend/.env (DB_USER=transur, DB_PASSWORD=...).

CREATE DATABASE IF NOT EXISTS transur CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'transur'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';
CREATE USER IF NOT EXISTS 'transur'@'127.0.0.1' IDENTIFIED BY 'YOUR_DB_PASSWORD';
GRANT ALL PRIVILEGES ON transur.* TO 'transur'@'localhost';
GRANT ALL PRIVILEGES ON transur.* TO 'transur'@'127.0.0.1';
FLUSH PRIVILEGES;
