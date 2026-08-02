-- Fuerza la codificación de la conexión para que tildes y ñ se guarden bien,
-- sin depender del charset por defecto del cliente MySQL.
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS codevote_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE codevote_db;

-- 1. facultad
CREATE TABLE facultad (
  id_facultad INT AUTO_INCREMENT PRIMARY KEY,
  nombre_facultad VARCHAR(100) NOT NULL
);

-- 2. director
CREATE TABLE director (
  id_director INT AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo VARCHAR(120) NOT NULL
);

-- 3. carrera
CREATE TABLE carrera (
  id_carrera INT AUTO_INCREMENT PRIMARY KEY,
  nombre_carrera VARCHAR(100) NOT NULL,
  fk_id_director INT,
  fk_id_facultad INT,
  CONSTRAINT fk_carrera_director FOREIGN KEY (fk_id_director) REFERENCES director(id_director),
  CONSTRAINT fk_carrera_facultad FOREIGN KEY (fk_id_facultad) REFERENCES facultad(id_facultad)
);

-- 4. estudiante
CREATE TABLE estudiante (
  cedula CHAR(10) PRIMARY KEY,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo_institucional VARCHAR(120) NOT NULL UNIQUE,
  promedio DECIMAL(5,2),
  estado_academico ENUM('activo', 'inactivo', 'egresado', 'graduado') NOT NULL DEFAULT 'activo',
  fk_id_carrera INT,
  password VARCHAR(255) NOT NULL, -- Added for JWT Auth
  rol ENUM('estudiante', 'admin', 'candidato') NOT NULL DEFAULT 'estudiante', -- Usado por el login y los middlewares de autorización
  foto_url VARCHAR(255) NULL DEFAULT NULL, -- URL de la foto de perfil (portal del estudiante)
  -- 1 = la cuenta tiene una contraseña temporal y debe cambiarla al entrar.
  debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_estudiante_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera)
);

-- 5. responsable
CREATE TABLE responsable (
  id_responsable INT AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  cargo VARCHAR(60),
  correo VARCHAR(120) NOT NULL
);

-- 6. proceso_electoral
CREATE TABLE proceso_electoral (
  id_proceso INT AUTO_INCREMENT PRIMARY KEY,
  nombre_proceso VARCHAR(120) NOT NULL,
  tipo_proceso ENUM('consejo_estudiantil', 'representante_carrera', 'referendum') NOT NULL,
  fecha_convocatoria DATE NOT NULL,
  fecha_inicio_votacion DATETIME NOT NULL,
  fecha_fin_votacion DATETIME NOT NULL,
  estado ENUM('planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio', 'finalizado', 'cancelado') NOT NULL DEFAULT 'planificado',
  descripcion VARCHAR(250),
  -- Marca de archivado: un proceso finalizado/cancelado se archiva (deja de
  -- aparecer en consultas activas) sin borrar su información histórica.
  archivado_at DATETIME NULL DEFAULT NULL,
  -- SIN USO desde 2026-07-30: la segmentación por carrera vive en votacion
  -- (cada papeleta representa una categoría/carrera). Se conserva la columna
  -- por compatibilidad, pero debe permanecer NULL.
  fk_id_carrera INT NULL DEFAULT NULL,
  -- Periodo de inscripción de listas y posesión de los electos.
  fecha_inicio_inscripcion DATETIME NULL DEFAULT NULL,
  fecha_fin_inscripcion DATETIME NULL DEFAULT NULL,
  fecha_posesion DATETIME NULL DEFAULT NULL,
  foto_url VARCHAR(255) NULL DEFAULT NULL,            -- Imagen del proceso (URL https)
  CONSTRAINT fk_proceso_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera)
);

-- 7. cronograma
CREATE TABLE cronograma (
  id_cronograma INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  fk_id_responsable INT NOT NULL,
  actividad VARCHAR(120) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  CONSTRAINT fk_cronograma_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso),
  CONSTRAINT fk_cronograma_responsable FOREIGN KEY (fk_id_responsable) REFERENCES responsable(id_responsable)
);

-- 8. votacion
-- Cada votación es una papeleta/categoría del proceso. fk_id_carrera define a
-- quién le corresponde: NULL = papeleta global (todos votan); con valor = solo
-- los estudiantes de esa carrera (p. ej. "Representante TICs").
CREATE TABLE votacion (
  id_votacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  titulo_papeleta VARCHAR(120) NOT NULL,
  fecha_apertura DATETIME NOT NULL,
  fecha_cierre DATETIME NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  fk_id_carrera INT NULL DEFAULT NULL,
  foto_url VARCHAR(255) NULL DEFAULT NULL,            -- Imagen de la papeleta (URL https)
  CONSTRAINT fk_votacion_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso),
  CONSTRAINT fk_votacion_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera),
  -- No puede haber dos papeletas de la misma carrera en un mismo proceso.
  -- (MySQL admite varios NULL, así que las globales no se restringen.)
  CONSTRAINT uq_votacion_proceso_carrera UNIQUE (fk_id_proceso, fk_id_carrera)
);

-- 9. lista_candidata
-- estado_revision: pendiente | en_revision | aprobada | rechazada | retirada
CREATE TABLE lista_candidata (
  id_lista INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  nombre_lista VARCHAR(80) NOT NULL,
  lema VARCHAR(120),
  estado_revision VARCHAR(30) NOT NULL DEFAULT 'en_revision',
  fecha_inscripcion DATE NOT NULL,
  motivo_rechazo VARCHAR(250) NULL DEFAULT NULL,       -- Observación del admin al rechazar
  fk_cedula_responsable CHAR(10) NULL DEFAULT NULL,    -- Candidato dueño de la lista (portal candidato)
  foto_url VARCHAR(255) NULL DEFAULT NULL,             -- Imagen principal de la lista (URL https)
  -- Papeleta en la que compite la lista. De aquí se deriva su carrera; por eso
  -- la carrera NO se duplica en esta tabla.
  fk_id_votacion INT NULL DEFAULT NULL,
  CONSTRAINT fk_lista_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso),
  CONSTRAINT fk_lista_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion),
  CONSTRAINT fk_lista_responsable FOREIGN KEY (fk_cedula_responsable) REFERENCES estudiante(cedula)
);

-- 10. candidato
-- Integrantes de una lista. OJO: estar aquí NO implica tener rol 'candidato'.
-- Solo el responsable de la lista (Presidente) es rol 'candidato' y entra al
-- Portal del candidato; el resto de integrantes conserva rol 'estudiante'.
CREATE TABLE candidato (
  id_candidato INT AUTO_INCREMENT PRIMARY KEY,
  cargo ENUM('Presidente', 'Vicepresidente', 'Secretario', 'Tesorero', 'Vocal') NOT NULL,
  cumple_requisitos TINYINT(1) DEFAULT 0,
  foto_url VARCHAR(255),
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_lista INT NOT NULL,
  -- Columna generada para garantizar UN solo Presidente por lista: vale el id
  -- de la lista solo en la fila del presidente y NULL en las demás (MySQL no
  -- considera duplicados los NULL en un índice único).
  lista_presidente INT GENERATED ALWAYS AS (CASE WHEN cargo = 'Presidente' THEN fk_id_lista END) STORED,
  CONSTRAINT fk_candidato_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  CONSTRAINT fk_candidato_lista FOREIGN KEY (fk_id_lista) REFERENCES lista_candidata(id_lista),
  CONSTRAINT uq_candidato_presidente_por_lista UNIQUE (lista_presidente),
  CONSTRAINT uq_candidato_estudiante_lista UNIQUE (fk_id_lista, fk_cedula_estudiante)
);

-- 11. requisito
CREATE TABLE requisito (
  id_requisito INT AUTO_INCREMENT PRIMARY KEY,
  nombre_requisito VARCHAR(100) NOT NULL,
  descripcion VARCHAR(250),
  tipo_requisito VARCHAR(40) NOT NULL
);

-- 12. validacion_requisito
CREATE TABLE validacion_requisito (
  id_validacion INT AUTO_INCREMENT PRIMARY KEY,
  cumple TINYINT(1) NOT NULL DEFAULT 0,
  observacion VARCHAR(250),
  fecha_validacion DATE NOT NULL,
  fk_id_candidato INT NOT NULL,
  fk_id_requisito INT NOT NULL,
  CONSTRAINT fk_validacion_candidato FOREIGN KEY (fk_id_candidato) REFERENCES candidato(id_candidato),
  CONSTRAINT fk_validacion_requisito FOREIGN KEY (fk_id_requisito) REFERENCES requisito(id_requisito)
);

-- 13. plan_trabajo
CREATE TABLE plan_trabajo (
  id_plan INT AUTO_INCREMENT PRIMARY KEY,
  area ENUM('academico', 'deportivo', 'cultural', 'infraestructura', 'social') NOT NULL,
  propuesta TEXT NOT NULL,
  archivo_url VARCHAR(255),
  fk_id_lista INT NOT NULL,
  CONSTRAINT fk_plan_lista FOREIGN KEY (fk_id_lista) REFERENCES lista_candidata(id_lista)
);

-- 14. voto
CREATE TABLE voto (
  id_voto INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_votacion INT NOT NULL,
  tipo_voto ENUM('valido', 'blanco', 'nulo') NOT NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fk_id_lista INT,
  CONSTRAINT fk_voto_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion),
  CONSTRAINT fk_voto_lista FOREIGN KEY (fk_id_lista) REFERENCES lista_candidata(id_lista)
);

-- 15. codigo_voto
CREATE TABLE codigo_voto (
  id_codigo INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_votacion INT NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  estado_codigo ENUM('generado', 'enviado', 'usado', 'expirado') NOT NULL DEFAULT 'generado',
  fecha_envio DATETIME,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  -- Identificador público OPACO (UUID v4 aleatorio) que el estudiante usa para
  -- verificar su participación. No revela la opción votada; `codigo_hash` queda
  -- reservado a la auditoría administrativa.
  codigo_verificacion CHAR(36) NOT NULL,
  CONSTRAINT uq_codigo_verificacion UNIQUE (codigo_verificacion),
  CONSTRAINT fk_codigo_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion),
  CONSTRAINT fk_codigo_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  -- Un estudiante solo puede tener un comprobante por votación (evita el doble voto,
  -- incluso ante solicitudes simultáneas).
  CONSTRAINT uq_codigo_votante UNIQUE (fk_id_votacion, fk_cedula_estudiante)
);

-- 16. acta_resultados
CREATE TABLE acta_resultados (
  id_acta INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_votacion INT NOT NULL,
  total_votantes INT NOT NULL DEFAULT 0,
  votos_validos INT NOT NULL DEFAULT 0,
  votos_blanco INT NOT NULL DEFAULT 0,
  votos_nulos INT NOT NULL DEFAULT 0,
  lista_ganadora VARCHAR(80),
  fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_acta_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)
);

-- 17. veedor
CREATE TABLE veedor (
  id_veedor INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  institucion VARCHAR(100),
  tipo_veedor ENUM('interno', 'externo', 'docente', 'estudiante') NOT NULL,
  correo VARCHAR(120) NOT NULL
);

-- 18. veeduria
CREATE TABLE veeduria (
  id_veeduria INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_votacion INT NOT NULL,
  fk_id_veedor INT NOT NULL,
  momento ENUM('apertura', 'desarrollo', 'cierre', 'escrutinio') NOT NULL,
  observacion VARCHAR(250),
  CONSTRAINT fk_veeduria_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion),
  CONSTRAINT fk_veeduria_veedor FOREIGN KEY (fk_id_veedor) REFERENCES veedor(id_veedor)
);

-- 19. notificacion (portal del estudiante)
CREATE TABLE notificacion (
  id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  mensaje VARCHAR(255) NOT NULL,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notificacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula)
);

-- 20. asignacion_candidatura (el admin asigna UNA papeleta a cada candidato)
-- El candidato no elige proceso/carrera/papeleta: trabaja solo con su asignación.
CREATE TABLE asignacion_candidatura (
  id_asignacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_votacion INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activa', 'retirada') NOT NULL DEFAULT 'activa',
  CONSTRAINT uq_asignacion_estudiante UNIQUE (fk_cedula_estudiante),
  CONSTRAINT fk_asignacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  CONSTRAINT fk_asignacion_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)
);
