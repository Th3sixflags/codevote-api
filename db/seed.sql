-- Fuerza la codificación de la conexión (tildes y ñ)
SET NAMES utf8mb4;

USE codevote_db;

-- 0. institución base de demostración
INSERT INTO institucion
  (id_institucion, nombre, slug, tipo, dominio_email, activo)
VALUES
  (1, 'Universidad Internacional del Ecuador', 'uide', 'universidad', 'uide.edu.ec', 1);

-- 1. facultad
INSERT INTO facultad (nombre_facultad, fk_id_institucion) VALUES
('Ingeniería y Ciencias Aplicadas', 1),
('Ciencias Médicas y de la Salud', 1);

-- 2. director
INSERT INTO director (nombres, apellidos, correo, fk_id_institucion) VALUES
('Carlos', 'Mendoza', 'cmendoza@uide.edu.ec', 1),
('Ana', 'Suárez', 'asuarez@uide.edu.ec', 1);

-- 3. carrera
INSERT INTO carrera (nombre_carrera, fk_id_director, fk_id_facultad, fk_id_institucion) VALUES
('Ingeniería de Software', 1, 1, 1),
('Ingeniería Civil', 1, 1, 1),
('Medicina', 2, 2, 1),
-- Carreras de la facultad usadas por los procesos de representante de carrera.
('Arquitectura', 1, 1, 1),
('Administración de Empresas', 1, 1, 1),
('Marketing e Inteligencia de Mercados', 1, 1, 1),
('Psicología Clínica', 2, 2, 1),
('TICs', 1, 1, 1),
('Derecho', 1, 1, 1);

-- 4. estudiante (20 registros con bcrypt password123)
-- Hash: $2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e
-- OJO: `promedio` va en escala 0–100, que es la que usa toda la aplicación
-- (PROMEDIO_MINIMO_POSTULACION = 85). No cargar notas sobre 10.
INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico, fk_id_carrera, password, rol, fk_id_institucion) VALUES
('1710000009', 'Steven', 'Chininin', 'stchinininca@uide.edu.ec', 95, 'activo', NULL, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'superadmin', NULL),
('1710000017', 'María', 'González', 'mgonzalez@uide.edu.ec', 82, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000025', 'Carlos', 'Pérez', 'cperez@uide.edu.ec', 75, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000033', 'Ana', 'Torres', 'atorres@uide.edu.ec', 98, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000041', 'Luis', 'Ramírez', 'lramirez@uide.edu.ec', 69, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000058', 'Sofía', 'Mendoza', 'smendoza@uide.edu.ec', 89, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000066', 'Diego', 'Castillo', 'dcastillo@uide.edu.ec', 78, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000074', 'Valentina', 'Ruiz', 'vruiz@uide.edu.ec', 91, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000082', 'Andrés', 'Mora', 'amora@uide.edu.ec', 84, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000090', 'Camila', 'Vega', 'cvega@uide.edu.ec', 72, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000108', 'Javier', 'Cordero', 'jcordero@uide.edu.ec', 86, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000116', 'Gabriela', 'Lara', 'glara@uide.edu.ec', 93, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000124', 'Felipe', 'Herrera', 'fherrera@uide.edu.ec', 68, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000132', 'Natalia', 'Ortiz', 'nortiz@uide.edu.ec', 88, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000140', 'Roberto', 'Iglesias', 'riglesias@uide.edu.ec', 79, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000157', 'Laura', 'Sánchez', 'lsanchez@uide.edu.ec', 92, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000165', 'Tomás', 'Rojas', 'trojas@uide.edu.ec', 74, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000173', 'Isabella', 'Flores', 'iflores@uide.edu.ec', 85, 'activo', 2, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000181', 'Martín', 'Acosta', 'macosta@uide.edu.ec', 71, 'activo', 3, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1),
('1710000199', 'Elena', 'Guerrero', 'eguerrero@uide.edu.ec', 90, 'activo', 1, '$2b$12$3OzHrkuizGgocsXFhBrmouJayTnyVknGV/Iorxjhk0xYUNsnQP.5e', 'estudiante', 1);

-- Usuario administrador de prueba (el resto queda con el rol 'estudiante' por defecto)
UPDATE estudiante SET rol = 'admin' WHERE cedula = '1710000017';

-- 5. responsable
INSERT INTO responsable (nombres, apellidos, cargo, correo) VALUES 
('Jorge', 'Salinas', 'Presidente Tribunal', 'jsalinas@uide.edu.ec'), 
('Marta', 'Reyes', 'Secretaria Tribunal', 'mreyes@uide.edu.ec');

-- 6. proceso_electoral
INSERT INTO proceso_electoral
  (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion,
   fecha_fin_votacion, estado, descripcion, fk_id_institucion)
VALUES
('Elecciones Consejo 2026', 'consejo_estudiantil', '2026-06-01', '2026-07-01 08:00:00', '2026-07-02 17:00:00', 'votacion', 'Elección principal del año', 1),
('Referéndum Estatutos 2025', 'referendum', '2025-05-01', '2025-06-01 08:00:00', '2025-06-02 17:00:00', 'finalizado', 'Revisión de estatutos', 1);

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
-- Cada lista compite en una papeleta concreta (fk_id_votacion); su carrera se
-- deriva de esa votación.
-- El responsable de la lista es su Presidente y la única persona de la lista con
-- rol 'candidato' (acceso al Portal del candidato).
INSERT INTO lista_candidata (fk_id_proceso, fk_id_votacion, nombre_lista, lema, estado_revision, fecha_inscripcion, fk_cedula_responsable) VALUES
(1, 1, 'Innovación UIDE', 'Hacia el futuro', 'aprobada', '2026-06-06', '1710000017'),
(1, 1, 'Unidad Estudiantil', 'Juntos somos más', 'aprobada', '2026-06-08', '1710000058'),
(2, 2, 'Opción SÍ', 'Mejores estatutos', 'aprobada', '2025-05-06', NULL);

-- Solo los dos responsables tienen rol 'candidato'; el resto de integrantes
-- sigue siendo 'estudiante'.
UPDATE estudiante SET rol = 'candidato' WHERE cedula IN ('1710000017', '1710000058');

-- Cada responsable necesita la asignación de la papeleta en la que compite para
-- operar el Portal del candidato.
INSERT INTO asignacion_candidatura (fk_cedula_estudiante, fk_id_votacion, estado) VALUES
('1710000017', 1, 'activa'),
('1710000058', 1, 'activa');

-- 10. candidato
-- Cada lista tiene exactamente un Presidente, que coincide con su responsable.
INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista) VALUES
('Presidente', 1, 'url_foto_1', '1710000017', 1),
('Vicepresidente', 1, 'url_foto_2', '1710000025', 1),
('Secretario', 1, 'url_foto_3', '1710000033', 1),
('Tesorero', 1, 'url_foto_4', '1710000041', 1),
-- Se evita a quienes ya emitieron voto en la papeleta 1 (ver codigo_voto): un
-- integrante no puede votar en la papeleta donde compite.
('Vocal', 1, 'url_foto_5', '1710000140', 1),
('Presidente', 1, 'url_foto_6', '1710000058', 2),
('Vicepresidente', 1, 'url_foto_7', '1710000066', 2),
('Secretario', 1, 'url_foto_8', '1710000074', 2),
('Tesorero', 1, 'url_foto_9', '1710000082', 2),
('Vocal', 1, 'url_foto_10', '1710000090', 2);

-- 11. requisito
INSERT INTO requisito (nombre_requisito, descripcion, tipo_requisito) VALUES 
('Promedio', 'Promedio mínimo de 85/100', 'academico'),
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
-- codigo_verificacion es obligatorio y único (identificador público del
-- comprobante). En datos reales lo genera el backend como UUID v4.
--
-- DEBE haber exactamente un comprobante por cada voto de la tabla `voto`: la
-- participación se cuenta con los comprobantes y el reparto con los votos. Si
-- no cuadran, la pantalla de resultados se contradice a sí misma (decía
-- "0 votos" y participación 0 % mientras listaba 3 votos debajo).
-- Ninguna de estas personas compite en la papeleta donde vota.
INSERT INTO codigo_voto (fk_id_votacion, codigo_hash, estado_codigo, fecha_envio, fk_cedula_estudiante, codigo_verificacion) VALUES
-- Papeleta 1 (Consejo Estudiantil): 4 votos -> 4 comprobantes. El resto del
-- padrón sigue habilitado, para poder votar en vivo durante la demostración.
(1, 'hash_codigo_1', 'usado', '2026-06-30 08:00:00', '1710000108', 'a1f4c0de-1111-4a1a-8b01-0c0de5eed001'),
(1, 'hash_codigo_2', 'usado', '2026-06-30 08:00:00', '1710000116', 'b2e5d1ef-2222-4b2b-9c02-1d1ef6ffe002'),
(1, 'hash_codigo_3', 'usado', '2026-06-30 08:00:00', '1710000124', 'c3d6e2f0-3333-4c3c-8d03-2e2f07aaf003'),
(1, 'hash_codigo_4', 'usado', '2026-06-30 08:00:00', '1710000132', 'd4e7f3a1-4444-4d4d-9e04-3f3a18bba004'),
-- Papeleta 2 (Referéndum): 5 votos -> 5 comprobantes.
(2, 'hash_codigo_6', 'usado', '2025-05-31 08:00:00', '1710000108', 'f6a9b5c3-6666-4f6f-9006-5b5c30ddc006'),
(2, 'hash_codigo_7', 'usado', '2025-05-31 08:00:00', '1710000116', 'a7bac6d4-7777-4a7a-8107-6c6d41eed007'),
(2, 'hash_codigo_8', 'usado', '2025-05-31 08:00:00', '1710000124', 'b8cbd7e5-8888-4b8b-9208-7d7e52ffe008'),
(2, 'hash_codigo_9', 'usado', '2025-05-31 08:00:00', '1710000132', 'c9dce8f6-9999-4c9c-8309-8e8f63aaf009'),
(2, 'hash_codigo_10', 'usado', '2025-05-31 08:00:00', '1710000157', 'daedf9a7-aaaa-4dad-940a-9f9a74bba00a');

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
