-- =============================================================================
-- Migración: inicio de sesión con código de un solo uso (OTP) por correo
-- Fecha: 2026-08-04
-- =============================================================================
-- El votante ya no escribe contraseña: indica su correo institucional (o su
-- cédula) y recibe un código de 6 dígitos en el correo. Esta tabla guarda esos
-- códigos mientras están vigentes.
--
-- Decisiones:
--   * Se guarda el SHA-256 del código, no el código. Con acceso de lectura a la
--     base no se puede suplantar a nadie: hay que interceptar el correo.
--   * `intentos` corta la fuerza bruta sobre un código de 6 dígitos.
--   * `usado_at` marca el consumo, de modo que un código sirve UNA sola vez
--     aunque el correo se reenvíe o quede en la bandeja.
--   * `ip` queda para auditoría de accesos.
--
-- La columna `password` de estudiante pasa a ser NULLABLE: las cuentas nuevas ya
-- no necesitan contraseña. No se borra la columna ni los hashes existentes para
-- poder volver atrás y porque AUTH_PASSWORD_FALLBACK=true reactiva el login por
-- contraseña como puerta de emergencia.
--
-- IDEMPOTENTE: re-ejecutarla no altera nada.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-08-04_login_otp.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- 1. Tabla de códigos de acceso.
CREATE TABLE IF NOT EXISTS codigo_acceso (
  id_codigo INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  -- SHA-256 en hexadecimal del código de 6 dígitos.
  codigo_hash CHAR(64) NOT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_at DATETIME NOT NULL,
  usado_at DATETIME NULL DEFAULT NULL,
  intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ip VARCHAR(45) NULL DEFAULT NULL,
  CONSTRAINT fk_codigo_acceso_estudiante
    FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula)
    ON DELETE CASCADE,
  INDEX idx_codigo_acceso_vigente (fk_cedula_estudiante, usado_at, expira_at)
);

-- 2. La contraseña deja de ser obligatoria.
SET @nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'password'
);
SET @ddl := IF(@nullable = 'NO',
  'ALTER TABLE estudiante MODIFY COLUMN password VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Con OTP no hay contraseña temporal que cambiar en el primer ingreso.
UPDATE estudiante SET debe_cambiar_password = 0 WHERE debe_cambiar_password = 1;
