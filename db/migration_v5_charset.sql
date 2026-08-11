-- ==============================================================================
-- MIGRACIÓN V5: Asegurar utf8mb4 en columnas de texto
-- ==============================================================================

-- Asegurar la base de datos completa (aplica por defecto a nuevas tablas)
ALTER DATABASE codevote_db CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- En lugar de CONVERT TO, modificamos solo las columnas de texto necesarias
-- para evitar incompatibilidades de claves foráneas con columnas como 'cedula'.

-- institucion
ALTER TABLE institucion DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE institucion MODIFY COLUMN nombre VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE institucion MODIFY COLUMN descripcion TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE institucion MODIFY COLUMN config_json JSON;

-- estudiante
ALTER TABLE estudiante DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE estudiante MODIFY COLUMN nombres VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE estudiante MODIFY COLUMN apellidos VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE estudiante MODIFY COLUMN correo_institucional VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- proceso_electoral
ALTER TABLE proceso_electoral DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE proceso_electoral MODIFY COLUMN nombre_proceso VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- lista_candidata
ALTER TABLE lista_candidata DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE lista_candidata MODIFY COLUMN nombre_lista VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- plan_trabajo
ALTER TABLE plan_trabajo DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE plan_trabajo MODIFY COLUMN propuesta TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- notificacion
ALTER TABLE notificacion DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE notificacion MODIFY COLUMN titulo VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE notificacion MODIFY COLUMN mensaje VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- responsable
ALTER TABLE responsable DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE responsable MODIFY COLUMN nombres VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE responsable MODIFY COLUMN apellidos VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE responsable MODIFY COLUMN cargo VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- facultad
ALTER TABLE facultad DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE facultad MODIFY COLUMN nombre_facultad VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- carrera
ALTER TABLE carrera DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE carrera MODIFY COLUMN nombre_carrera VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- director
ALTER TABLE director DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE director MODIFY COLUMN nombres VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE director MODIFY COLUMN apellidos VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
