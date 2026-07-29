-- =============================================================================
-- Migración: Imagen principal de la lista candidata
-- Fecha: 2026-07-29
-- =============================================================================
-- IDEMPOTENTE. Agrega la columna foto_url a lista_candidata (URL https de la
-- imagen principal de la lista). Se aplica a mano en producción ANTES de
-- desplegar el código que la consume:
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_foto_lista_candidata.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'foto_url'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
