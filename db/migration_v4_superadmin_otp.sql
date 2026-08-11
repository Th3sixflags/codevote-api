-- ==============================================================================
-- MIGRACIÓN V4: Unificación de SuperAdmin bajo OTP
-- ==============================================================================

-- 1. Actualizar el ENUM del rol en la tabla estudiante para incluir 'superadmin'
-- Es idempotente: si ya tiene el rol, simplemente lo re-declara con el mismo tipo.
ALTER TABLE estudiante 
  MODIFY COLUMN rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante';

-- 2. Eliminar la tabla aislada de superadmin (si existe)
DROP TABLE IF EXISTS superadmin;
