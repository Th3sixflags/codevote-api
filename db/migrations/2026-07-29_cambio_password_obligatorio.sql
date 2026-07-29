-- =============================================================================
-- Migración: cambio de contraseña obligatorio en el primer ingreso
-- Fecha: 2026-07-29
-- =============================================================================
-- Las cuentas que crea el administrador nacen con una contraseña temporal
-- compartida, así que deben cambiarla la primera vez que entran. La bandera se
-- pone en 1 al crear la cuenta (o cuando el admin reinicia la contraseña) y
-- vuelve a 0 cuando la persona la cambia desde su perfil.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_cambio_password_obligatorio.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'debe_cambiar_password'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE estudiante ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
