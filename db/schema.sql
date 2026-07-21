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
  rol ENUM('estudiante', 'admin') NOT NULL DEFAULT 'estudiante', -- Usado por el login y los middlewares de autorización
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
  descripcion VARCHAR(250)
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
CREATE TABLE votacion (
  id_votacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  titulo_papeleta VARCHAR(120) NOT NULL,
  fecha_apertura DATETIME NOT NULL,
  fecha_cierre DATETIME NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT fk_votacion_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso)
);

-- 9. lista_candidata
CREATE TABLE lista_candidata (
  id_lista INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  nombre_lista VARCHAR(80) NOT NULL,
  lema VARCHAR(120),
  estado_revision VARCHAR(30) NOT NULL DEFAULT 'en_revision',
  fecha_inscripcion DATE NOT NULL,
  CONSTRAINT fk_lista_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso)
);

-- 10. candidato
CREATE TABLE candidato (
  id_candidato INT AUTO_INCREMENT PRIMARY KEY,
  cargo ENUM('presidente', 'vicepresidente', 'secretario', 'tesorero', 'vocal') NOT NULL,
  cumple_requisitos TINYINT(1) DEFAULT 0,
  foto_url VARCHAR(255),
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_lista INT NOT NULL,
  CONSTRAINT fk_candidato_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  CONSTRAINT fk_candidato_lista FOREIGN KEY (fk_id_lista) REFERENCES lista_candidata(id_lista)
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
  CONSTRAINT fk_codigo_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion),
  CONSTRAINT fk_codigo_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula)
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
