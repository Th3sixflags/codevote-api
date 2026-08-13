-- =============================================================================
-- Control operacional de migraciones
--
-- Crea el ledger append-only de migraciones aplicadas. Este archivo no altera
-- tablas electorales ni datos de votación. Es idempotente.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  nombre_archivo VARCHAR(255) NOT NULL PRIMARY KEY,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  aplicada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aplicada_por VARCHAR(100) NULL,
  INDEX idx_schema_migrations_aplicada_at (aplicada_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
