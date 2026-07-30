-- =============================================================================
-- Migración: la carrera pasa del PROCESO a la VOTACIÓN
-- Fecha: 2026-07-30
-- =============================================================================
-- Nuevo modelo de representantes por carrera:
--
--   proceso_electoral  "Representantes de Carrera 2026"   (general, sin carrera)
--     └── votacion     "Representante TICs"          -> fk_id_carrera = TICs
--     └── votacion     "Representante Arquitectura"   -> fk_id_carrera = Arquitectura
--           └── lista_candidata  -> fk_id_votacion (compite en esa papeleta)
--
-- Cambios:
--   1. votacion.fk_id_carrera   -> NULL = papeleta global; con valor = categoría
--                                  de esa carrera. Único por (proceso, carrera):
--                                  no puede haber dos papeletas de la misma
--                                  carrera en un mismo proceso.
--   2. lista_candidata.fk_id_votacion -> la papeleta en la que compite la lista.
--   3. proceso_electoral.fk_id_carrera queda SIN USO (la carrera vive en la
--      votación). Se pone a NULL por si algún proceso la tenía.
--
-- Las fechas del proceso (convocatoria, inscripción, votación, posesión) se
-- mantienen tal cual.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_carrera_por_votacion.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- --- 1. Carrera en la votación ----------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND COLUMN_NAME = 'fk_id_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD COLUMN fk_id_carrera INT NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND CONSTRAINT_NAME = 'fk_votacion_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD CONSTRAINT fk_votacion_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Una sola papeleta por carrera dentro de un proceso. En MySQL un índice único
-- admite varios NULL, así que las papeletas globales no se ven afectadas.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND INDEX_NAME = 'uq_votacion_proceso_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD CONSTRAINT uq_votacion_proceso_carrera UNIQUE (fk_id_proceso, fk_id_carrera)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- 2. Votación (papeleta) a la que pertenece cada lista --------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'fk_id_votacion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN fk_id_votacion INT NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND CONSTRAINT_NAME = 'fk_lista_votacion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD CONSTRAINT fk_lista_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: si el proceso de la lista tiene EXACTAMENTE una votación, se asigna
-- esa. Si tiene varias, queda NULL y se reporta al final para resolverlo a mano.
UPDATE lista_candidata l
JOIN (
  SELECT fk_id_proceso, MIN(id_votacion) AS id_votacion, COUNT(*) AS cuantas
  FROM votacion GROUP BY fk_id_proceso
) v ON v.fk_id_proceso = l.fk_id_proceso AND v.cuantas = 1
SET l.fk_id_votacion = v.id_votacion
WHERE l.fk_id_votacion IS NULL;

-- --- 3. El proceso ya no lleva carrera --------------------------------------
UPDATE proceso_electoral SET fk_id_carrera = NULL WHERE fk_id_carrera IS NOT NULL;

-- --- 4. Pendientes por revisar ----------------------------------------------
SELECT id_lista, nombre_lista, fk_id_proceso,
       'lista SIN votacion: asignarle una papeleta desde el panel' AS pendiente
FROM lista_candidata WHERE fk_id_votacion IS NULL;
