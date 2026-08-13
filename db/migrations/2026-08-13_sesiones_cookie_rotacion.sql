-- =============================================================================
-- Sesiones con cookies HttpOnly y refresh opaco rotatorio
-- Fecha: 2026-08-13
--
-- Requiere la migración P1: 2026-08-12_p1_sesiones_auditoria_hash_actas.sql.
-- Es idempotente: CREATE TABLE IF NOT EXISTS no altera ni elimina sesiones.
-- Nunca se almacena el refresh en claro, solo SHA-256(token).
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

CREATE TABLE IF NOT EXISTS sesion_refresh (
  id_refresh BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_sesion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_at DATETIME NOT NULL,
  usado_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT uq_sesion_refresh_hash UNIQUE (token_hash),
  CONSTRAINT uq_sesion_refresh_sesion UNIQUE (id_sesion),
  CONSTRAINT fk_sesion_refresh_sesion FOREIGN KEY (id_sesion)
    REFERENCES sesion(id_sesion) ON DELETE CASCADE,
  INDEX idx_sesion_refresh_activo (expira_at, usado_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
