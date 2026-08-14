-- Fuerza la codificación de la conexión para que tildes y ñ se guarden bien,
-- sin depender del charset por defecto del cliente MySQL.
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS codevote_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE codevote_db;

-- 0. institucion (raíz del aislamiento multi-tenant)
CREATE TABLE institucion (
  id_institucion INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  tipo VARCHAR(50) NOT NULL DEFAULT 'universidad',
  descripcion TEXT NULL,
  logo_url VARCHAR(500) NULL,
  colores_json JSON NULL,
  config_json JSON NULL,
  email_contacto VARCHAR(255) NULL,
  telefono VARCHAR(50) NULL,
  direccion TEXT NULL,
  sitio_web VARCHAR(500) NULL,
  dominio_email VARCHAR(100) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. facultad
CREATE TABLE facultad (
  id_facultad INT AUTO_INCREMENT PRIMARY KEY,
  nombre_facultad VARCHAR(100) NOT NULL,
  fk_id_institucion INT NOT NULL,
  UNIQUE KEY uq_facultad_tenant_ref (id_facultad, fk_id_institucion),
  CONSTRAINT fk_facultad_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion)
);

-- 2. director
CREATE TABLE director (
  id_director INT AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo VARCHAR(120) NOT NULL,
  fk_id_institucion INT NOT NULL,
  UNIQUE KEY uq_director_tenant_ref (id_director, fk_id_institucion),
  CONSTRAINT fk_director_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion)
);

-- 3. carrera
CREATE TABLE carrera (
  id_carrera INT AUTO_INCREMENT PRIMARY KEY,
  nombre_carrera VARCHAR(100) NOT NULL,
  fk_id_director INT,
  fk_id_facultad INT,
  fk_id_institucion INT NOT NULL,
  UNIQUE KEY uq_carrera_tenant_ref (id_carrera, fk_id_institucion),
  CONSTRAINT fk_carrera_director FOREIGN KEY (fk_id_director) REFERENCES director(id_director),
  CONSTRAINT fk_carrera_facultad FOREIGN KEY (fk_id_facultad) REFERENCES facultad(id_facultad),
  CONSTRAINT fk_carrera_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion),
  CONSTRAINT fk_carrera_director_tenant FOREIGN KEY (fk_id_director, fk_id_institucion)
    REFERENCES director(id_director, fk_id_institucion),
  CONSTRAINT fk_carrera_facultad_tenant FOREIGN KEY (fk_id_facultad, fk_id_institucion)
    REFERENCES facultad(id_facultad, fk_id_institucion)
);

-- 4. estudiante
CREATE TABLE estudiante (
  cedula VARCHAR(20) PRIMARY KEY,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo_institucional VARCHAR(120) NOT NULL UNIQUE,
  promedio DECIMAL(5,2),
  estado_academico ENUM('activo', 'inactivo', 'egresado', 'graduado') NOT NULL DEFAULT 'activo',
  fk_id_carrera INT,
  fecha_ingreso DATE NULL DEFAULT NULL,
  membresia_activa TINYINT(1) NOT NULL DEFAULT 1,
  password VARCHAR(255) NULL, -- Legado: el acceso actual usa OTP, no contraseña
  rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante', -- Usado por el login y los middlewares de autorización
  foto_url VARCHAR(255) NULL DEFAULT NULL, -- URL de la foto de perfil (portal del estudiante)
  -- 1 = la cuenta tiene una contraseña temporal y debe cambiarla al entrar.
  debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0,
  fk_id_institucion INT NULL, -- NULL únicamente para superadmin global
  CONSTRAINT fk_estudiante_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera),
  CONSTRAINT fk_estudiante_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion),
  CONSTRAINT fk_estudiante_carrera_tenant FOREIGN KEY (fk_id_carrera, fk_id_institucion)
    REFERENCES carrera(id_carrera, fk_id_institucion)
);

-- Membresía por institución. La identidad (cédula) sigue siendo global para
-- conservar las referencias históricas; estos campos pertenecen al tenant y
-- permiten que una persona aparezca en varias instituciones.
CREATE TABLE estudiante_institucion (
  id_membresia BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cedula VARCHAR(20) NOT NULL,
  fk_id_institucion INT NOT NULL,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo_institucional VARCHAR(120) NOT NULL,
  promedio DECIMAL(5,2) NULL,
  estado_academico ENUM('activo', 'inactivo', 'egresado', 'graduado') NOT NULL DEFAULT 'activo',
  fk_id_carrera INT NULL,
  fecha_ingreso DATE NULL DEFAULT NULL,
  membresia_activa TINYINT(1) NOT NULL DEFAULT 1,
  rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante',
  foto_url VARCHAR(255) NULL DEFAULT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_membresia_cedula_institucion (cedula, fk_id_institucion),
  UNIQUE KEY uq_membresia_correo_institucion (correo_institucional, fk_id_institucion),
  KEY idx_membresia_institucion (fk_id_institucion, estado_academico, membresia_activa),
  CONSTRAINT fk_membresia_persona FOREIGN KEY (cedula) REFERENCES estudiante(cedula) ON DELETE CASCADE,
  CONSTRAINT fk_membresia_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion),
  CONSTRAINT fk_membresia_carrera_tenant FOREIGN KEY (fk_id_carrera, fk_id_institucion)
    REFERENCES carrera(id_carrera, fk_id_institucion)
);

CREATE OR REPLACE VIEW estudiante_por_institucion AS
SELECT m.id_membresia, m.cedula, m.fk_id_institucion, m.nombres, m.apellidos,
       m.correo_institucional, m.promedio, m.estado_academico, m.fk_id_carrera,
       m.fecha_ingreso, m.membresia_activa, m.rol, m.foto_url
  FROM estudiante_institucion m
UNION ALL
SELECT NULL AS id_membresia, e.cedula, e.fk_id_institucion, e.nombres, e.apellidos,
       e.correo_institucional, e.promedio, e.estado_academico, e.fk_id_carrera,
       e.fecha_ingreso, e.membresia_activa, e.rol, e.foto_url
  FROM estudiante e
 WHERE e.fk_id_institucion IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM estudiante_institucion m
      WHERE m.cedula = e.cedula AND m.fk_id_institucion = e.fk_id_institucion
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
  fk_id_institucion INT NOT NULL,
  CONSTRAINT fk_proceso_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera),
  CONSTRAINT fk_proceso_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion)
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
  fk_cedula_responsable VARCHAR(20) NULL DEFAULT NULL,    -- Candidato dueño de la lista (portal candidato)
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
  fk_cedula_estudiante VARCHAR(20) NOT NULL,
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
  fk_cedula_estudiante VARCHAR(20) NOT NULL,
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
  hash_version TINYINT UNSIGNED NOT NULL DEFAULT 1,
  hash_algoritmo VARCHAR(16) NOT NULL DEFAULT 'SHA-256',
  hash_acta CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT uq_acta_votacion UNIQUE (fk_id_votacion),
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
  fk_cedula_estudiante VARCHAR(20) NOT NULL,
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
  fk_cedula_estudiante VARCHAR(20) NOT NULL,
  fk_id_votacion INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activa', 'retirada') NOT NULL DEFAULT 'activa',
  CONSTRAINT uq_asignacion_estudiante UNIQUE (fk_cedula_estudiante),
  CONSTRAINT fk_asignacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  CONSTRAINT fk_asignacion_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)
);

-- 21. historial_importacion
CREATE TABLE historial_importacion (
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
);

-- 22. sesión JWT revocable. El token conserva su contrato Bearer, pero su jti
-- debe apuntar a una fila activa para que logout y revocación sean inmediatos.
CREATE TABLE sesion (
  id_sesion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  fk_cedula_estudiante VARCHAR(20) NOT NULL,
  fk_id_institucion INT NULL,
  creada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_at DATETIME NOT NULL,
  revocada_at DATETIME NULL DEFAULT NULL,
  ultimo_uso_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  motivo_revocacion VARCHAR(80) NULL,
  INDEX idx_sesion_usuario_activa (fk_cedula_estudiante, revocada_at, expira_at),
  INDEX idx_sesion_institucion (fk_id_institucion, fk_cedula_estudiante, revocada_at),
  CONSTRAINT fk_sesion_estudiante FOREIGN KEY (fk_cedula_estudiante)
    REFERENCES estudiante(cedula) ON DELETE CASCADE,
  CONSTRAINT fk_sesion_institucion FOREIGN KEY (fk_id_institucion)
    REFERENCES institucion(id_institucion) ON DELETE SET NULL
);

-- 23. bitácora append-only. Los triggers de inmutabilidad se instalan mediante
-- db/migrations/2026-08-12_p1_sesiones_auditoria_hash_actas.sql.
CREATE TABLE auditoria_evento (
  id_evento BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha_evento DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actor_cedula VARCHAR(20) NULL,
  actor_rol VARCHAR(20) NULL,
  fk_id_institucion INT NULL,
  id_sesion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  accion VARCHAR(80) NOT NULL,
  metodo VARCHAR(10) NULL,
  ruta VARCHAR(255) NULL,
  estado_http SMALLINT UNSIGNED NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  detalles JSON NULL,
  hash_evento CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  INDEX idx_auditoria_fecha (fecha_evento),
  INDEX idx_auditoria_actor (actor_cedula, fecha_evento),
  INDEX idx_auditoria_institucion (fk_id_institucion, fecha_evento),
  INDEX idx_auditoria_accion (accion, fecha_evento)
);
