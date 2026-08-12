-- ==============================================================================
-- MIGRACIÓN V7: Unificar collations a utf8mb4_unicode_ci
-- Repara el ER_CANT_AGGREGATE_2COLLATIONS en consultas UNION.
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Eliminar temporalmente claves foráneas que dependen de cedula u otros campos de texto modificados
ALTER TABLE lista_candidata DROP FOREIGN KEY fk_lista_responsable;
ALTER TABLE candidato DROP FOREIGN KEY fk_candidato_estudiante;
ALTER TABLE codigo_voto DROP FOREIGN KEY fk_codigo_estudiante;
ALTER TABLE notificacion DROP FOREIGN KEY fk_notificacion_estudiante;
ALTER TABLE asignacion_candidatura DROP FOREIGN KEY fk_asignacion_estudiante;
ALTER TABLE historial_importacion DROP FOREIGN KEY fk_historial_importador;
ALTER TABLE sancion_electoral DROP FOREIGN KEY fk_sancion_estudiante;
ALTER TABLE codigo_acceso DROP FOREIGN KEY fk_codigo_acceso_estudiante;

-- 2. Modificar columnas a utf8mb4_unicode_ci
-- ESTUDIANTE
ALTER TABLE estudiante DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE estudiante MODIFY COLUMN cedula VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE estudiante MODIFY COLUMN foto_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE estudiante MODIFY COLUMN password VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE estudiante MODIFY COLUMN estado_academico ENUM('activo', 'inactivo', 'egresado', 'graduado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activo';
ALTER TABLE estudiante MODIFY COLUMN rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'estudiante';

-- LISTA CANDIDATA
ALTER TABLE lista_candidata DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE lista_candidata MODIFY COLUMN fk_cedula_responsable VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE lista_candidata MODIFY COLUMN lema VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE lista_candidata MODIFY COLUMN motivo_rechazo VARCHAR(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE lista_candidata MODIFY COLUMN foto_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE lista_candidata MODIFY COLUMN estado_revision VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_revision';

-- CANDIDATO
ALTER TABLE candidato DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE candidato MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE candidato MODIFY COLUMN foto_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

-- CODIGO VOTO
ALTER TABLE codigo_voto DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE codigo_voto MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE codigo_voto MODIFY COLUMN codigo_hash VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE codigo_voto MODIFY COLUMN codigo_verificacion CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE codigo_voto MODIFY COLUMN estado_codigo ENUM('generado', 'enviado', 'usado', 'expirado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generado';

-- CODIGO ACCESO
ALTER TABLE codigo_acceso DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE codigo_acceso MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE codigo_acceso MODIFY COLUMN codigo_hash VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE codigo_acceso MODIFY COLUMN ip VARCHAR(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

-- NOTIFICACION
ALTER TABLE notificacion DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE notificacion MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE notificacion MODIFY COLUMN tipo VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- ASIGNACION CANDIDATURA
ALTER TABLE asignacion_candidatura DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE asignacion_candidatura MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE asignacion_candidatura MODIFY COLUMN estado ENUM('activa', 'retirada') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activa';

-- HISTORIAL IMPORTACION
ALTER TABLE historial_importacion DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE historial_importacion MODIFY COLUMN cedula_importador VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE historial_importacion MODIFY COLUMN nombre_archivo VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- SANCION ELECTORAL
-- Convertimos CHAR(10) a VARCHAR(20) para que coincida exactamente con estudiante.cedula
ALTER TABLE sancion_electoral DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE sancion_electoral MODIFY COLUMN fk_cedula_estudiante VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE sancion_electoral MODIFY COLUMN motivo VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'No participó en la votación';
ALTER TABLE sancion_electoral MODIFY COLUMN observacion VARCHAR(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE sancion_electoral MODIFY COLUMN estado ENUM('activa', 'justificada', 'anulada') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activa';

-- ACTA RESULTADOS
ALTER TABLE acta_resultados DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE acta_resultados MODIFY COLUMN lista_ganadora VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

-- VOTO
ALTER TABLE voto DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE voto MODIFY COLUMN tipo_voto ENUM('valido', 'blanco', 'nulo') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- VOTACION
ALTER TABLE votacion DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE votacion MODIFY COLUMN titulo_papeleta VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE votacion MODIFY COLUMN estado VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente';
ALTER TABLE votacion MODIFY COLUMN foto_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;

-- PROCESO ELECTORAL
ALTER TABLE proceso_electoral DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE proceso_electoral MODIFY COLUMN descripcion VARCHAR(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE proceso_electoral MODIFY COLUMN foto_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE proceso_electoral MODIFY COLUMN estado ENUM('planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio', 'finalizado', 'cancelado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planificado';
ALTER TABLE proceso_electoral MODIFY COLUMN tipo_proceso ENUM('consejo_estudiantil', 'representante_carrera', 'referendum') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- 3. Restaurar claves foráneas
ALTER TABLE lista_candidata ADD CONSTRAINT fk_lista_responsable FOREIGN KEY (fk_cedula_responsable) REFERENCES estudiante(cedula);
ALTER TABLE candidato ADD CONSTRAINT fk_candidato_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula);
ALTER TABLE codigo_voto ADD CONSTRAINT fk_codigo_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula);
ALTER TABLE notificacion ADD CONSTRAINT fk_notificacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula);
ALTER TABLE asignacion_candidatura ADD CONSTRAINT fk_asignacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula);
ALTER TABLE historial_importacion ADD CONSTRAINT fk_historial_importador FOREIGN KEY (cedula_importador) REFERENCES estudiante(cedula);
ALTER TABLE sancion_electoral ADD CONSTRAINT fk_sancion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula) ON DELETE CASCADE;
ALTER TABLE codigo_acceso ADD CONSTRAINT fk_codigo_acceso_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
