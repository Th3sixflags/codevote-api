-- =============================================================================
-- Migración: Código de verificación público del comprobante
-- Fecha: 2026-07-29
-- =============================================================================
-- Agrega `codigo_verificacion` a codigo_voto: un identificador público OPACO y
-- aleatorio (UUID v4) que el estudiante puede usar para comprobar que su voto
-- quedó registrado, SIN exponer `codigo_hash` ni la opción elegida.
--
-- Nota de privacidad: se genera con bytes aleatorios (formato v4), NO con la
-- función UUID() de MySQL, que produce UUID v1 e incrusta marca de tiempo y
-- dirección MAC. Un UUID v1 sería correlacionable con la hora del voto y
-- debilitaría el anonimato.
--
-- IDEMPOTENTE: agrega la columna, rellena las filas existentes, crea el índice
-- único y recién entonces la marca NOT NULL. Re-ejecutarla no altera nada.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_codigo_verificacion.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- 1. Columna (nullable de entrada, para poder rellenar las filas existentes).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_voto' AND COLUMN_NAME = 'codigo_verificacion'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE codigo_voto ADD COLUMN codigo_verificacion CHAR(36) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Backfill de comprobantes anteriores con un UUID v4 aleatorio por fila.
UPDATE codigo_voto
SET codigo_verificacion = LOWER(CONCAT(
      HEX(RANDOM_BYTES(4)), '-',
      HEX(RANDOM_BYTES(2)), '-',
      '4', SUBSTRING(HEX(RANDOM_BYTES(2)), 2, 3), '-',
      SUBSTRING('89ab', 1 + FLOOR(RAND() * 4), 1), SUBSTRING(HEX(RANDOM_BYTES(2)), 2, 3), '-',
      HEX(RANDOM_BYTES(6))
    ))
WHERE codigo_verificacion IS NULL;

-- 3. Índice único (el código es la referencia pública del comprobante).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_voto' AND INDEX_NAME = 'uq_codigo_verificacion'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE codigo_voto ADD CONSTRAINT uq_codigo_verificacion UNIQUE (codigo_verificacion)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Ya sin nulos: se exige siempre presente.
ALTER TABLE codigo_voto MODIFY COLUMN codigo_verificacion CHAR(36) NOT NULL;
