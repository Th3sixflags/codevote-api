-- ==============================================================================
-- MIGRACIÓN V6: Importación CSV e Identificadores Flexibles
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ampliar cedula a VARCHAR(20) en estudiante y todas sus referencias
ALTER TABLE estudiante MODIFY COLUMN cedula VARCHAR(20) NOT NULL;
ALTER TABLE lista_candidata MODIFY COLUMN fk_cedula_responsable VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE candidato MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) NOT NULL;
ALTER TABLE codigo_voto MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) NOT NULL;
ALTER TABLE notificacion MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) NOT NULL;
ALTER TABLE asignacion_candidatura MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) NOT NULL;

-- 2. Crear tabla de historial de importaciones
CREATE TABLE IF NOT EXISTS historial_importacion (
  id_importacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_institucion INT NOT NULL,
  cedula_importador VARCHAR(20) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nombre_archivo VARCHAR(255) NOT NULL,
  total_filas INT NOT NULL DEFAULT 0,
  filas_importadas INT NOT NULL DEFAULT 0,
  filas_rechazadas INT NOT NULL DEFAULT 0,
  filas_duplicadas INT NOT NULL DEFAULT 0,
  errores_json JSON NULL,
  CONSTRAINT fk_historial_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion),
  CONSTRAINT fk_historial_importador FOREIGN KEY (cedula_importador) REFERENCES estudiante(cedula)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
