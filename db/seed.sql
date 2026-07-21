-- Fuerza la codificación de la conexión (tildes y ñ)
SET NAMES utf8mb4;

USE codevote_db;

-- 1. facultad
INSERT INTO facultad (nombre_facultad) VALUES 
('Ingeniería y Ciencias Aplicadas'), 
('Ciencias Médicas y de la Salud');

-- 2. director
INSERT INTO director (nombres, apellidos, correo) VALUES 
('Carlos', 'Mendoza', 'cmendoza@uide.edu.ec'), 
('Ana', 'Suárez', 'asuarez@uide.edu.ec');

-- 3. carrera
INSERT INTO carrera (nombre_carrera, fk_id_director, fk_id_facultad) VALUES 
('Ingeniería de Software', 1, 1), 
('Ingeniería Civil', 1, 1), 
('Medicina', 2, 2);

-- 4. estudiante (20 registros con bcrypt password123)
-- Hash: $2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e
INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico, fk_id_carrera, password) VALUES
('1700000001', 'Steven', 'Chininin', 'schininin@uide.edu.ec', 9.5, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000002', 'María', 'González', 'mgonzalez@uide.edu.ec', 8.2, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000003', 'Carlos', 'Pérez', 'cperez@uide.edu.ec', 7.5, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000004', 'Ana', 'Torres', 'atorres@uide.edu.ec', 9.8, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000005', 'Luis', 'Ramírez', 'lramirez@uide.edu.ec', 6.9, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000006', 'Sofía', 'Mendoza', 'smendoza@uide.edu.ec', 8.9, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000007', 'Diego', 'Castillo', 'dcastillo@uide.edu.ec', 7.8, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000008', 'Valentina', 'Ruiz', 'vruiz@uide.edu.ec', 9.1, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000009', 'Andrés', 'Mora', 'amora@uide.edu.ec', 8.4, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000010', 'Camila', 'Vega', 'cvega@uide.edu.ec', 7.2, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000011', 'Javier', 'Cordero', 'jcordero@uide.edu.ec', 8.6, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000012', 'Gabriela', 'Lara', 'glara@uide.edu.ec', 9.3, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000013', 'Martín', 'Suárez', 'msuarez@uide.edu.ec', 8.0, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000014', 'Lucía', 'Peña', 'lpena@uide.edu.ec', 7.9, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000015', 'Sebastián', 'Vargas', 'svargas@uide.edu.ec', 8.8, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000016', 'Isabella', 'Ríos', 'irios@uide.edu.ec', 9.0, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000017', 'Emilio', 'Bravo', 'ebravo@uide.edu.ec', 7.6, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000018', 'Antonella', 'Medina', 'amedina@uide.edu.ec', 8.5, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000019', 'Joaquín', 'Navarro', 'jnavarro@uide.edu.ec', 9.2, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e'),
('1700000020', 'Renata', 'León', 'rleon@uide.edu.ec', 8.1, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e');

-- Usuario administrador de prueba (el resto queda con el rol 'estudiante' por defecto)
UPDATE estudiante SET rol = 'admin' WHERE cedula = '1700000001';

-- 5. responsable
INSERT INTO responsable (nombres, apellidos, cargo, correo) VALUES 
('Jorge', 'Salinas', 'Presidente Tribunal', 'jsalinas@uide.edu.ec'), 
('Marta', 'Reyes', 'Secretaria Tribunal', 'mreyes@uide.edu.ec');

-- 6. proceso_electoral
INSERT INTO proceso_electoral (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion, fecha_fin_votacion, estado, descripcion) VALUES 
('Elecciones Consejo 2026', 'consejo_estudiantil', '2026-06-01', '2026-07-01 08:00:00', '2026-07-02 17:00:00', 'votacion', 'Elección principal del año'),
('Referéndum Estatutos 2025', 'referendum', '2025-05-01', '2025-06-01 08:00:00', '2025-06-02 17:00:00', 'finalizado', 'Revisión de estatutos');

-- 7. cronograma
INSERT INTO cronograma (fk_id_proceso, fk_id_responsable, actividad, fecha_inicio, fecha_fin) VALUES 
(1, 1, 'Inscripción de listas', '2026-06-05', '2026-06-10'),
(1, 2, 'Campaña electoral', '2026-06-15', '2026-06-28'),
(2, 1, 'Inscripción de propuestas', '2025-05-05', '2025-05-10'),
(2, 2, 'Foros de debate', '2025-05-15', '2025-05-28');

-- 8. votacion
INSERT INTO votacion (fk_id_proceso, titulo_papeleta, fecha_apertura, fecha_cierre, estado) VALUES 
(1, 'Papeleta Consejo Estudiantil', '2026-07-01 08:00:00', '2026-07-02 17:00:00', 'abierta'),
(2, 'Papeleta Referéndum', '2025-06-01 08:00:00', '2025-06-02 17:00:00', 'cerrada');

-- 9. lista_candidata
INSERT INTO lista_candidata (fk_id_proceso, nombre_lista, lema, estado_revision, fecha_inscripcion) VALUES 
(1, 'Innovación UIDE', 'Hacia el futuro', 'aprobada', '2026-06-06'),
(1, 'Unidad Estudiantil', 'Juntos somos más', 'aprobada', '2026-06-08'),
(2, 'Opción SÍ', 'Mejores estatutos', 'aprobada', '2025-05-06');

-- 10. candidato
INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista) VALUES 
('presidente', 1, 'url_foto_1', '1700000001', 1),
('vicepresidente', 1, 'url_foto_2', '1700000002', 1),
('secretario', 1, 'url_foto_3', '1700000003', 1),
('tesorero', 1, 'url_foto_4', '1700000004', 1),
('vocal', 1, 'url_foto_5', '1700000005', 1),
('presidente', 1, 'url_foto_6', '1700000006', 2),
('vicepresidente', 1, 'url_foto_7', '1700000007', 2),
('secretario', 1, 'url_foto_8', '1700000008', 2),
('tesorero', 1, 'url_foto_9', '1700000009', 2),
('vocal', 1, 'url_foto_10', '1700000010', 2);

-- 11. requisito
INSERT INTO requisito (nombre_requisito, descripcion, tipo_requisito) VALUES 
('Promedio', 'Promedio mayor a 8.0', 'academico'),
('Matricula', 'Estar legalmente matriculado', 'academico'),
('Sin Sanciones', 'No tener sanciones disciplinarias', 'disciplinario');

-- 12. validacion_requisito
INSERT INTO validacion_requisito (cumple, observacion, fecha_validacion, fk_id_candidato, fk_id_requisito) VALUES 
(1, 'OK', '2026-06-11', 1, 1),
(1, 'OK', '2026-06-11', 1, 2),
(1, 'OK', '2026-06-11', 1, 3);

-- 13. plan_trabajo
INSERT INTO plan_trabajo (area, propuesta, archivo_url, fk_id_lista) VALUES 
('academico', 'Mejorar tutorías', 'url_plan_1', 1),
('infraestructura', 'Nuevos laboratorios', 'url_plan_2', 1),
('deportivo', 'Torneos interfacultades', 'url_plan_3', 2);

-- 14. voto
INSERT INTO voto (fk_id_votacion, tipo_voto, fecha_hora, fk_id_lista) VALUES 
(2, 'valido', '2025-06-01 10:00:00', 3),
(2, 'blanco', '2025-06-01 11:00:00', NULL),
(2, 'valido', '2025-06-01 12:00:00', 3),
(2, 'nulo', '2025-06-01 13:00:00', NULL),
(2, 'valido', '2025-06-01 14:00:00', 3),
(1, 'valido', '2026-07-01 09:00:00', 1),
(1, 'valido', '2026-07-01 10:00:00', 2),
(1, 'blanco', '2026-07-01 11:00:00', NULL),
(1, 'valido', '2026-07-01 12:00:00', 1);

-- 15. codigo_voto
INSERT INTO codigo_voto (fk_id_votacion, codigo_hash, estado_codigo, fecha_envio, fk_cedula_estudiante) VALUES 
(1, 'hash_codigo_1', 'usado', '2026-06-30 08:00:00', '1700000011'),
(1, 'hash_codigo_2', 'usado', '2026-06-30 08:00:00', '1700000012'),
(1, 'hash_codigo_3', 'usado', '2026-06-30 08:00:00', '1700000013'),
(1, 'hash_codigo_4', 'usado', '2026-06-30 08:00:00', '1700000014');

-- 16. acta_resultados
INSERT INTO acta_resultados (fk_id_votacion, total_votantes, votos_validos, votos_blanco, votos_nulos, lista_ganadora, fecha_emision) VALUES 
(2, 5, 3, 1, 1, 'Opción SÍ', '2025-06-03 10:00:00');

-- 17. veedor
INSERT INTO veedor (nombre, institucion, tipo_veedor, correo) VALUES 
('Observador Nacional', 'CNE', 'externo', 'obs@cne.gob.ec'), 
('Profesor Delegado', 'UIDE', 'docente', 'pdelegado@uide.edu.ec');

-- 18. veeduria
INSERT INTO veeduria (fk_id_votacion, fk_id_veedor, momento, observacion) VALUES 
(2, 1, 'apertura', 'Todo en orden'),
(2, 2, 'cierre', 'Cierre puntual');
