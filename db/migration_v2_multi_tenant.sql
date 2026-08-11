-- Migration v2: Multi-tenant support
-- Adds institution management and superadmin role
SET NAMES utf8mb4;
USE codevote_db;

-- 1. New table: institucion (organizations/institutions)
CREATE TABLE IF NOT EXISTS institucion (
    id_institucion INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL DEFAULT 'universidad',
    descripcion TEXT NULL,
    logo_url VARCHAR(500) NULL,
    colores_json JSON NULL COMMENT 'Paleta de colores personalizable: {primary, secondary, ...}',
    config_json JSON NULL COMMENT 'Configuración institucional: {requiere_promedio, tipos_proceso, ...}',
    email_contacto VARCHAR(255) NULL,
    telefono VARCHAR(50) NULL,
    direccion TEXT NULL,
    sitio_web VARCHAR(500) NULL,
    dominio_email VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stored Procedure for Idempotent Column Additions
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _cv_migration_v2()
BEGIN
  -- Add slug if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'slug') THEN
    ALTER TABLE institucion ADD COLUMN slug VARCHAR(100) NULL UNIQUE AFTER nombre;
  END IF;
  -- Add colores_json if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'colores_json') THEN
    ALTER TABLE institucion ADD COLUMN colores_json JSON NULL AFTER logo_url;
  END IF;
  -- Add config_json if missing  
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'config_json') THEN
    ALTER TABLE institucion ADD COLUMN config_json JSON NULL AFTER colores_json;
  END IF;
  -- Drop old config column if exists
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'config') THEN
    ALTER TABLE institucion DROP COLUMN config;
  END IF;
  -- Add fk_id_institucion to estudiante if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE estudiante ADD COLUMN fk_id_institucion INT NULL;
    ALTER TABLE estudiante ADD CONSTRAINT fk_estudiante_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
  -- Add fk_id_institucion to proceso_electoral if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE proceso_electoral ADD COLUMN fk_id_institucion INT NULL;
    ALTER TABLE proceso_electoral ADD CONSTRAINT fk_proceso_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
END //
DELIMITER ;
CALL _cv_migration_v2();
DROP PROCEDURE IF EXISTS _cv_migration_v2;

-- Change tipo_proceso from ENUM to VARCHAR (safe: MySQL keeps existing data)
ALTER TABLE proceso_electoral MODIFY COLUMN tipo_proceso VARCHAR(60) NOT NULL;
