-- =============================================================================
-- Migración: procesos electorales segmentados por carrera
-- Fecha: 2026-07-30
-- =============================================================================
-- 1. Carga las carreras de la facultad (sin borrar las existentes: hay
--    estudiantes referenciándolas por clave foránea).
-- 2. Agrega a proceso_electoral:
--      fk_id_carrera             -> NULL en procesos globales (consejo,
--                                   referéndum); obligatoria en los de
--                                   representante de carrera.
--      fecha_inicio_inscripcion  -> apertura del periodo de inscripción de listas
--      fecha_fin_inscripcion     -> cierre del periodo de inscripción
--      fecha_posesion            -> posesión de los electos
--
-- La carrera de una lista NO se duplica: se obtiene desde su proceso electoral.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_procesos_por_carrera.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- --- 1. Carreras -------------------------------------------------------------
-- Se insertan solo si no existen ya (por nombre).
INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Arquitectura') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Arquitectura');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Administración de Empresas') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Administración de Empresas');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Marketing e Inteligencia de Mercados') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Marketing e Inteligencia de Mercados');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Psicología Clínica') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Psicología Clínica');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'TICs') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'TICs');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Derecho') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Derecho');

-- --- 2. Columnas nuevas en proceso_electoral ---------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fk_id_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fk_id_carrera INT NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral'
    AND CONSTRAINT_NAME = 'fk_proceso_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD CONSTRAINT fk_proceso_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fecha_inicio_inscripcion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fecha_inicio_inscripcion DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fecha_fin_inscripcion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fecha_fin_inscripcion DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fecha_posesion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fecha_posesion DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- 3. Aviso: procesos de representante que quedaron sin carrera ------------
SELECT id_proceso, nombre_proceso,
       'representante_carrera SIN carrera: asignarle una desde el panel' AS pendiente
FROM proceso_electoral
WHERE tipo_proceso = 'representante_carrera' AND fk_id_carrera IS NULL;
