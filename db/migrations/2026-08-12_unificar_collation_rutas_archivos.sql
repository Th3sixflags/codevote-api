-- =============================================================================
-- Unifica la codificación de todas las rutas de archivos de CodeVote.
--
-- Motivo:
--   La limpieza que se ejecuta al arrancar los avisos combina estas columnas
--   mediante UNION. Una base histórica podía conservar archivo_url con una
--   collation distinta de los foto_url y provocar ER_CANT_AGGREGATE_NCOLLATIONS.
--
-- Idempotencia:
--   Cada ALTER declara el estado final completo de la columna. Ejecutar este
--   archivo varias veces vuelve a establecer la misma definición y no cambia
--   ni elimina datos.
-- =============================================================================

ALTER TABLE institucion
  MODIFY COLUMN logo_url VARCHAR(500)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

ALTER TABLE estudiante
  MODIFY COLUMN foto_url VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

ALTER TABLE proceso_electoral
  MODIFY COLUMN foto_url VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

ALTER TABLE votacion
  MODIFY COLUMN foto_url VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

ALTER TABLE lista_candidata
  MODIFY COLUMN foto_url VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

ALTER TABLE candidato
  MODIFY COLUMN foto_url VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

ALTER TABLE plan_trabajo
  MODIFY COLUMN archivo_url VARCHAR(255)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
