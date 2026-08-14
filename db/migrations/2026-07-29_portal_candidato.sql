-- =============================================================================
-- Migración: Portal del candidato + archivado de procesos + retiro de listas
-- Fecha: 2026-07-29
-- =============================================================================
-- IDEMPOTENTE: se puede ejecutar varias veces sin error. La base de producción
-- ya existe y el pipeline NO corre migraciones automáticamente, así que este
-- archivo se aplica a mano:
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_portal_candidato.sql
--
-- No borra ni modifica datos existentes: solo agrega columnas/valores nuevos.
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- -----------------------------------------------------------------------------
-- 1. Rol 'candidato' en estudiante.
--    MODIFY COLUMN es idempotente (re-ejecutar deja la misma definición).
--    El candidato conserva el acceso a votación (las rutas de voto solo exigen
--    autenticación, no un rol específico).
-- -----------------------------------------------------------------------------
ALTER TABLE estudiante
  MODIFY COLUMN rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante';

-- -----------------------------------------------------------------------------
-- 2. Archivado de procesos electorales (columna archivado_at).
--    Se prefiere una marca de tiempo NULL en vez de tocar el ENUM `estado`,
--    para no alterar la lógica de estados existente. Un proceso archivado
--    desaparece de las consultas activas pero se conserva para historial.
-- -----------------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'archivado_at'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN archivado_at DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 3. Motivo de rechazo de una lista candidata (observación del administrador).
-- -----------------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'motivo_rechazo'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN motivo_rechazo VARCHAR(250) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4. Propietario/responsable de la lista candidata (estudiante candidato).
--    Columna + clave foránea, ambas agregadas de forma idempotente.
-- -----------------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'fk_cedula_responsable'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN fk_cedula_responsable CHAR(10) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata'
    AND CONSTRAINT_NAME = 'fk_lista_responsable'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD CONSTRAINT fk_lista_responsable FOREIGN KEY (fk_cedula_responsable) REFERENCES estudiante(cedula)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
