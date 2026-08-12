-- =============================================================================
-- P1: sesiones revocables, auditoría append-only y hash SHA-256 de actas
-- Fecha: 2026-08-12
--
-- Idempotencia:
--   - tablas y columnas se crean solo si faltan;
--   - los hashes existentes solo se rellenan cuando están vacíos;
--   - los triggers se recrean con la misma definición;
--   - puede ejecutarse varias veces sin duplicar ni perder evidencia.
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

CREATE TABLE IF NOT EXISTS sesion (
  id_sesion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  fk_cedula_estudiante VARCHAR(20) NOT NULL,
  creada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_at DATETIME NOT NULL,
  revocada_at DATETIME NULL DEFAULT NULL,
  ultimo_uso_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  motivo_revocacion VARCHAR(80) NULL,
  INDEX idx_sesion_usuario_activa (fk_cedula_estudiante, revocada_at, expira_at),
  CONSTRAINT fk_sesion_estudiante FOREIGN KEY (fk_cedula_estudiante)
    REFERENCES estudiante(cedula) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria_evento (
  id_evento BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha_evento DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actor_cedula VARCHAR(20) NULL,
  actor_rol VARCHAR(20) NULL,
  fk_id_institucion INT NULL,
  id_sesion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  accion VARCHAR(80) NOT NULL,
  metodo VARCHAR(10) NULL,
  ruta VARCHAR(255) NULL,
  estado_http SMALLINT UNSIGNED NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  detalles JSON NULL,
  hash_evento CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  INDEX idx_auditoria_fecha (fecha_evento),
  INDEX idx_auditoria_actor (actor_cedula, fecha_evento),
  INDEX idx_auditoria_institucion (fk_id_institucion, fecha_evento),
  INDEX idx_auditoria_accion (accion, fecha_evento)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DELIMITER //
DROP PROCEDURE IF EXISTS _cv_p1_hash_actas //
CREATE PROCEDURE _cv_p1_hash_actas()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acta_resultados'
       AND COLUMN_NAME = 'hash_version'
  ) THEN
    ALTER TABLE acta_resultados
      ADD COLUMN hash_version TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER fecha_emision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acta_resultados'
       AND COLUMN_NAME = 'hash_algoritmo'
  ) THEN
    ALTER TABLE acta_resultados
      ADD COLUMN hash_algoritmo VARCHAR(16) NOT NULL DEFAULT 'SHA-256' AFTER hash_version;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acta_resultados'
       AND COLUMN_NAME = 'hash_acta'
  ) THEN
    ALTER TABLE acta_resultados
      ADD COLUMN hash_acta CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER hash_algoritmo;
  END IF;

  UPDATE acta_resultados
     SET hash_version = 1,
         hash_algoritmo = 'SHA-256',
         hash_acta = SHA2(CONCAT(
           'codevote-acta:v1\n',
           'votacion:', fk_id_votacion, '\n',
           'total_votantes:', total_votantes, '\n',
           'votos_validos:', votos_validos, '\n',
           'votos_blanco:', votos_blanco, '\n',
           'votos_nulos:', votos_nulos, '\n',
           'lista_ganadora_hex:', UPPER(HEX(CONVERT(COALESCE(lista_ganadora, '') USING utf8mb4))), '\n',
           'fecha_emision:', DATE_FORMAT(fecha_emision, '%Y-%m-%d %H:%i:%s')
         ), 256)
   WHERE hash_acta IS NULL OR hash_acta = '';

  ALTER TABLE acta_resultados
    MODIFY COLUMN hash_acta CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;
END //
DELIMITER ;

CALL _cv_p1_hash_actas();
DROP PROCEDURE IF EXISTS _cv_p1_hash_actas;

-- La aplicación solo puede anexar auditoría. Ni siquiera un bug de repositorio
-- puede reescribir o borrar la historia mediante UPDATE/DELETE.
DELIMITER //
DROP TRIGGER IF EXISTS trg_auditoria_evento_no_update //
CREATE TRIGGER trg_auditoria_evento_no_update
BEFORE UPDATE ON auditoria_evento
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es inmutable: UPDATE no permitido.';
END //

DROP TRIGGER IF EXISTS trg_auditoria_evento_no_delete //
CREATE TRIGGER trg_auditoria_evento_no_delete
BEFORE DELETE ON auditoria_evento
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es inmutable: DELETE no permitido.';
END //

-- Un acta sellada tampoco puede cambiar o desaparecer: una corrección debe ser
-- una nueva evidencia explícita, no una reescritura silenciosa del escrutinio.
DROP TRIGGER IF EXISTS trg_acta_resultados_no_update //
CREATE TRIGGER trg_acta_resultados_no_update
BEFORE UPDATE ON acta_resultados
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El acta es inmutable: UPDATE no permitido.';
END //

DROP TRIGGER IF EXISTS trg_acta_resultados_no_delete //
CREATE TRIGGER trg_acta_resultados_no_delete
BEFORE DELETE ON acta_resultados
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El acta es inmutable: DELETE no permitido.';
END //
DELIMITER ;
