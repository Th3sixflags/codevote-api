-- Migración: membresías de una persona en varias instituciones
-- Fecha: 2026-08-14
--
-- La tabla estudiante conserva una fila canónica por cédula para mantener
-- compatibilidad con las claves foráneas históricas. Esta tabla contiene los
-- datos que sí pertenecen a la relación persona–institución (correo, carrera,
-- rol y estado académico). Así una misma cédula puede pertenecer a más de un
-- tenant sin duplicar la identidad ni romper referencias existentes.
--
-- Es segura de ejecutar varias veces: crea la estructura si no existe y copia
-- las membresías históricas con INSERT IGNORE.

SET NAMES utf8mb4;
USE codevote_db;

CREATE TABLE IF NOT EXISTS estudiante_institucion (
  id_membresia BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cedula VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  fk_id_institucion INT NOT NULL,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo_institucional VARCHAR(120) NOT NULL,
  promedio DECIMAL(5,2) NULL,
  estado_academico ENUM('activo', 'inactivo', 'egresado', 'graduado') NOT NULL DEFAULT 'activo',
  fk_id_carrera INT NULL,
  fecha_ingreso DATE NULL DEFAULT NULL,
  membresia_activa TINYINT(1) NOT NULL DEFAULT 1,
  rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante',
  foto_url VARCHAR(255) NULL DEFAULT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_membresia),
  UNIQUE KEY uq_membresia_cedula_institucion (cedula, fk_id_institucion),
  UNIQUE KEY uq_membresia_correo_institucion (correo_institucional, fk_id_institucion),
  KEY idx_membresia_institucion (fk_id_institucion, estado_academico, membresia_activa),
  CONSTRAINT fk_membresia_persona FOREIGN KEY (cedula) REFERENCES estudiante(cedula) ON DELETE CASCADE,
  CONSTRAINT fk_membresia_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion),
  CONSTRAINT fk_membresia_carrera_tenant FOREIGN KEY (fk_id_carrera, fk_id_institucion)
    REFERENCES carrera(id_carrera, fk_id_institucion)
);

INSERT IGNORE INTO estudiante_institucion
  (cedula, fk_id_institucion, nombres, apellidos, correo_institucional,
   promedio, estado_academico, fk_id_carrera, fecha_ingreso,
   membresia_activa, rol, foto_url)
SELECT cedula, fk_id_institucion, nombres, apellidos, correo_institucional,
       promedio, estado_academico, fk_id_carrera, fecha_ingreso,
       membresia_activa, rol, foto_url
  FROM estudiante
 WHERE fk_id_institucion IS NOT NULL;

-- Compatibilidad con integraciones antiguas que todavía insertan directamente
-- en estudiante (por ejemplo importadores externos y fixtures). La vista no
-- duplica una membresía ya migrada y permite una transición gradual.
CREATE OR REPLACE VIEW estudiante_por_institucion AS
SELECT m.id_membresia, m.cedula, m.fk_id_institucion, m.nombres, m.apellidos,
       m.correo_institucional, m.promedio, m.estado_academico, m.fk_id_carrera,
       m.fecha_ingreso, m.membresia_activa, m.rol, m.foto_url
  FROM estudiante_institucion m
UNION ALL
SELECT NULL AS id_membresia, e.cedula, e.fk_id_institucion, e.nombres, e.apellidos,
       e.correo_institucional, e.promedio, e.estado_academico, e.fk_id_carrera,
       e.fecha_ingreso, e.membresia_activa, e.rol, e.foto_url
  FROM estudiante e
 WHERE e.fk_id_institucion IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM estudiante_institucion m
      WHERE m.cedula = e.cedula AND m.fk_id_institucion = e.fk_id_institucion
   );

-- La institución elegida en el login queda ligada a la sesión revocable. Esto
-- evita que un refresh vuelva a resolver una cédula ambigua en otro tenant.
-- Se usa un procedimiento temporal para que la migración sea idempotente en
-- instalaciones existentes y limpias.
DELIMITER //
DROP PROCEDURE IF EXISTS _cv_membresia_login_session //
CREATE PROCEDURE _cv_membresia_login_session()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion')
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion' AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE sesion ADD COLUMN fk_id_institucion INT NULL AFTER fk_cedula_estudiante;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion')
     AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion' AND INDEX_NAME = 'idx_sesion_institucion') THEN
    ALTER TABLE sesion ADD INDEX idx_sesion_institucion (fk_id_institucion, fk_cedula_estudiante, revocada_at);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion')
     AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sesion' AND CONSTRAINT_NAME = 'fk_sesion_institucion') THEN
    ALTER TABLE sesion ADD CONSTRAINT fk_sesion_institucion FOREIGN KEY (fk_id_institucion)
      REFERENCES institucion(id_institucion) ON DELETE SET NULL;
  END IF;
  -- Los OTP también se aíslan por tenant. Sin esta columna, un código pedido
  -- para la institución A podría canjearse al elegir B con la misma cédula.
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_acceso')
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_acceso' AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE codigo_acceso ADD COLUMN fk_id_institucion INT NULL AFTER fk_cedula_estudiante;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_acceso')
     AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_acceso' AND INDEX_NAME = 'idx_codigo_acceso_tenant') THEN
    ALTER TABLE codigo_acceso ADD INDEX idx_codigo_acceso_tenant (fk_id_institucion, fk_cedula_estudiante, usado_at, expira_at);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_acceso')
     AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_acceso' AND CONSTRAINT_NAME = 'fk_codigo_acceso_institucion') THEN
    ALTER TABLE codigo_acceso ADD CONSTRAINT fk_codigo_acceso_institucion FOREIGN KEY (fk_id_institucion)
      REFERENCES institucion(id_institucion) ON DELETE SET NULL;
  END IF;
END //
DELIMITER ;
CALL _cv_membresia_login_session();
DROP PROCEDURE IF EXISTS _cv_membresia_login_session;
