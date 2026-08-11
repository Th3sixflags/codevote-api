-- Migration v3: Dynamic Electoral Rules
-- Adds support for organization requirements such as seniority (fecha_ingreso) and active membership (membresia_activa).
SET NAMES utf8mb4;
USE codevote_db;

DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _cv_migration_v3()
BEGIN
  -- Add fecha_ingreso if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'fecha_ingreso') THEN
    ALTER TABLE estudiante ADD COLUMN fecha_ingreso DATE NULL AFTER fk_id_carrera;
  END IF;

  -- Add membresia_activa if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'membresia_activa') THEN
    ALTER TABLE estudiante ADD COLUMN membresia_activa TINYINT(1) NOT NULL DEFAULT 1 AFTER fecha_ingreso;
  END IF;
END //
DELIMITER ;
CALL _cv_migration_v3();
DROP PROCEDURE IF EXISTS _cv_migration_v3;
