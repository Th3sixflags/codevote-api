-- Migration v2: Multi-tenant support
-- Adds institution management and superadmin role
SET NAMES utf8mb4;
USE codevote_db;

-- 1. New table: institucion (organizations/institutions)
CREATE TABLE IF NOT EXISTS institucion (
    id_institucion INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'universidad',
    logo_url VARCHAR(500) NULL,
    descripcion TEXT NULL,
    email_contacto VARCHAR(255) NULL,
    telefono VARCHAR(50) NULL,
    direccion TEXT NULL,
    sitio_web VARCHAR(500) NULL,
    dominio_email VARCHAR(100) NULL,
    config JSON NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. New table: superadmin (platform administrators, NOT students)
CREATE TABLE IF NOT EXISTS superadmin (
    id_superadmin INT AUTO_INCREMENT PRIMARY KEY,
    nombres VARCHAR(80) NOT NULL,
    apellidos VARCHAR(80) NOT NULL,
    correo VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add institution FK to estudiante
ALTER TABLE estudiante
    ADD COLUMN fk_id_institucion INT NULL,
    ADD CONSTRAINT fk_estudiante_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);

-- 4. Add institution FK to proceso_electoral
ALTER TABLE proceso_electoral
    ADD COLUMN fk_id_institucion INT NULL,
    ADD CONSTRAINT fk_proceso_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);

-- 5. Change tipo_proceso from ENUM to VARCHAR for custom types per institution
ALTER TABLE proceso_electoral
    MODIFY COLUMN tipo_proceso VARCHAR(60) NOT NULL;
