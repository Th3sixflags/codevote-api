-- =============================================================================
-- La jornada electoral pertenece a cada papeleta, no al proceso.
--
-- Hace opcionales las fechas globales heredadas para que los procesos nuevos no
-- tengan dos calendarios en conflicto. Las columnas se conservan para lectura
-- de procesos históricos y esta migración se puede ejecutar más de una vez.
-- =============================================================================

SET NAMES utf8mb4;

SET @schema := DATABASE();
SET @tabla := 'proceso_electoral';

SET @inicio_es_obligatorio := (
  SELECT IS_NULLABLE = 'NO'
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @tabla
     AND COLUMN_NAME = 'fecha_inicio_votacion'
);
SET @sql_inicio := IF(@inicio_es_obligatorio = 1,
  'ALTER TABLE proceso_electoral MODIFY COLUMN fecha_inicio_votacion DATETIME NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt_inicio FROM @sql_inicio;
EXECUTE stmt_inicio;
DEALLOCATE PREPARE stmt_inicio;

SET @fin_es_obligatorio := (
  SELECT IS_NULLABLE = 'NO'
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @tabla
     AND COLUMN_NAME = 'fecha_fin_votacion'
);
SET @sql_fin := IF(@fin_es_obligatorio = 1,
  'ALTER TABLE proceso_electoral MODIFY COLUMN fecha_fin_votacion DATETIME NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt_fin FROM @sql_fin;
EXECUTE stmt_fin;
DEALLOCATE PREPARE stmt_fin;
