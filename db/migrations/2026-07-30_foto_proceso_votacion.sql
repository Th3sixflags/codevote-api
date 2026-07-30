-- =============================================================================
-- Migración: imagen de procesos y papeletas
-- Fecha: 2026-07-30
-- =============================================================================
-- Imagen opcional (URL https) para el proceso electoral y para cada votación
-- (papeleta). Ejemplos: Consejo Estudiantil → imagen institucional de la UIDE;
-- Representante TICs → imagen de la carrera.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_foto_proceso_votacion.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'foto_url');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND COLUMN_NAME = 'foto_url');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
