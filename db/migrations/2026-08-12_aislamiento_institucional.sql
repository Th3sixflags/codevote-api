-- Migración: endurecimiento multi-tenant de padrón y catálogos institucionales
-- Fecha: 2026-08-12
--
-- Objetivos:
--   1. Adscribir facultad, director y carrera a una institución.
--   2. Impedir referencias carrera/facultad/director entre instituciones.
--   3. Impedir que un estudiante apunte a una carrera de otro tenant.
--   4. Garantizar una sola acta oficial por papeleta.
--
-- La migración es idempotente. El backfill solo asigna una institución cuando
-- la relación existente la determina de forma unívoca. Si quedan catálogos sin
-- institución o existen actas duplicadas, se detiene sin borrar evidencia: esos
-- casos requieren una decisión manual antes de continuar.

SET NAMES utf8mb4;
USE codevote_db;

DELIMITER //
DROP PROCEDURE IF EXISTS _cv_aislamiento_institucional //
CREATE PROCEDURE _cv_aislamiento_institucional()
BEGIN
  DECLARE instituciones INT DEFAULT 0;
  DECLARE pendientes INT DEFAULT 0;
  DECLARE duplicadas INT DEFAULT 0;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'facultad'
                   AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE facultad ADD COLUMN fk_id_institucion INT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'director'
                   AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE director ADD COLUMN fk_id_institucion INT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carrera'
                   AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE carrera ADD COLUMN fk_id_institucion INT NULL;
  END IF;

  -- Carrera: padrón y procesos existentes son las fuentes de pertenencia.
  UPDATE carrera c
  JOIN (
    SELECT fk_id_carrera, MIN(fk_id_institucion) AS institucion,
           COUNT(DISTINCT fk_id_institucion) AS tenants
      FROM estudiante
     WHERE fk_id_carrera IS NOT NULL AND fk_id_institucion IS NOT NULL
     GROUP BY fk_id_carrera
  ) x ON x.fk_id_carrera = c.id_carrera AND x.tenants = 1
  SET c.fk_id_institucion = COALESCE(c.fk_id_institucion, x.institucion);

  UPDATE carrera c
  JOIN (
    SELECT v.fk_id_carrera, MIN(p.fk_id_institucion) AS institucion,
           COUNT(DISTINCT p.fk_id_institucion) AS tenants
      FROM votacion v
      JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
     WHERE v.fk_id_carrera IS NOT NULL AND p.fk_id_institucion IS NOT NULL
     GROUP BY v.fk_id_carrera
  ) x ON x.fk_id_carrera = c.id_carrera AND x.tenants = 1
  SET c.fk_id_institucion = COALESCE(c.fk_id_institucion, x.institucion);

  -- Facultad y director se derivan de sus carreras cuando no hay ambigüedad.
  UPDATE facultad f
  JOIN (
    SELECT fk_id_facultad, MIN(fk_id_institucion) AS institucion,
           COUNT(DISTINCT fk_id_institucion) AS tenants
      FROM carrera
     WHERE fk_id_facultad IS NOT NULL AND fk_id_institucion IS NOT NULL
     GROUP BY fk_id_facultad
  ) x ON x.fk_id_facultad = f.id_facultad AND x.tenants = 1
  SET f.fk_id_institucion = COALESCE(f.fk_id_institucion, x.institucion);

  UPDATE director d
  JOIN (
    SELECT fk_id_director, MIN(fk_id_institucion) AS institucion,
           COUNT(DISTINCT fk_id_institucion) AS tenants
      FROM carrera
     WHERE fk_id_director IS NOT NULL AND fk_id_institucion IS NOT NULL
     GROUP BY fk_id_director
  ) x ON x.fk_id_director = d.id_director AND x.tenants = 1
  SET d.fk_id_institucion = COALESCE(d.fk_id_institucion, x.institucion);

  -- Instalaciones antiguas de una sola institución no tenían relaciones desde
  -- todos los catálogos. En ese único caso el tenant es inequívoco.
  SELECT COUNT(*) INTO instituciones FROM institucion;
  IF instituciones = 1 THEN
    UPDATE carrera SET fk_id_institucion = (SELECT MIN(id_institucion) FROM institucion)
     WHERE fk_id_institucion IS NULL;
    UPDATE facultad SET fk_id_institucion = (SELECT MIN(id_institucion) FROM institucion)
     WHERE fk_id_institucion IS NULL;
    UPDATE director SET fk_id_institucion = (SELECT MIN(id_institucion) FROM institucion)
     WHERE fk_id_institucion IS NULL;
  END IF;

  SELECT (SELECT COUNT(*) FROM carrera WHERE fk_id_institucion IS NULL)
       + (SELECT COUNT(*) FROM facultad WHERE fk_id_institucion IS NULL)
       + (SELECT COUNT(*) FROM director WHERE fk_id_institucion IS NULL)
    INTO pendientes;
  IF pendientes > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Backfill multi-tenant ambiguo: asigne fk_id_institucion a carrera/facultad/director y reejecute.';
  END IF;

  SELECT COUNT(*) INTO duplicadas
    FROM (SELECT fk_id_votacion FROM acta_resultados
           GROUP BY fk_id_votacion HAVING COUNT(*) > 1) d;
  IF duplicadas > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Existen actas duplicadas: deben auditarse manualmente antes de crear uq_acta_votacion.';
  END IF;

  ALTER TABLE carrera MODIFY COLUMN fk_id_institucion INT NOT NULL;
  ALTER TABLE facultad MODIFY COLUMN fk_id_institucion INT NOT NULL;
  ALTER TABLE director MODIFY COLUMN fk_id_institucion INT NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carrera'
                   AND INDEX_NAME = 'uq_carrera_tenant_ref') THEN
    ALTER TABLE carrera ADD UNIQUE KEY uq_carrera_tenant_ref (id_carrera, fk_id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'facultad'
                   AND INDEX_NAME = 'uq_facultad_tenant_ref') THEN
    ALTER TABLE facultad ADD UNIQUE KEY uq_facultad_tenant_ref (id_facultad, fk_id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'director'
                   AND INDEX_NAME = 'uq_director_tenant_ref') THEN
    ALTER TABLE director ADD UNIQUE KEY uq_director_tenant_ref (id_director, fk_id_institucion);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'carrera'
                   AND CONSTRAINT_NAME = 'fk_carrera_institucion') THEN
    ALTER TABLE carrera ADD CONSTRAINT fk_carrera_institucion
      FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'facultad'
                   AND CONSTRAINT_NAME = 'fk_facultad_institucion') THEN
    ALTER TABLE facultad ADD CONSTRAINT fk_facultad_institucion
      FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'director'
                   AND CONSTRAINT_NAME = 'fk_director_institucion') THEN
    ALTER TABLE director ADD CONSTRAINT fk_director_institucion
      FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'carrera'
                   AND CONSTRAINT_NAME = 'fk_carrera_facultad_tenant') THEN
    ALTER TABLE carrera ADD CONSTRAINT fk_carrera_facultad_tenant
      FOREIGN KEY (fk_id_facultad, fk_id_institucion)
      REFERENCES facultad(id_facultad, fk_id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'carrera'
                   AND CONSTRAINT_NAME = 'fk_carrera_director_tenant') THEN
    ALTER TABLE carrera ADD CONSTRAINT fk_carrera_director_tenant
      FOREIGN KEY (fk_id_director, fk_id_institucion)
      REFERENCES director(id_director, fk_id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante'
                   AND CONSTRAINT_NAME = 'fk_estudiante_carrera_tenant') THEN
    ALTER TABLE estudiante ADD CONSTRAINT fk_estudiante_carrera_tenant
      FOREIGN KEY (fk_id_carrera, fk_id_institucion)
      REFERENCES carrera(id_carrera, fk_id_institucion);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acta_resultados'
                   AND INDEX_NAME = 'uq_acta_votacion') THEN
    ALTER TABLE acta_resultados ADD CONSTRAINT uq_acta_votacion UNIQUE (fk_id_votacion);
  END IF;
END //
DELIMITER ;

CALL _cv_aislamiento_institucional();
DROP PROCEDURE IF EXISTS _cv_aislamiento_institucional;
