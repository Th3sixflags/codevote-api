-- ==============================================================================
-- MIGRACIÓN V5: Asegurar utf8mb4 nativo en todas las tablas
-- ==============================================================================

-- Asegurar la base de datos completa
ALTER DATABASE codevote_db CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Convertir tablas principales al charset explícito
ALTER TABLE institucion CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE estudiante CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE proceso_electoral CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE lista CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE propuesta CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE integrante_lista CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE responsable CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE facultad CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE carrera CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE director CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
