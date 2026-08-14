SET FOREIGN_KEY_CHECKS=0;
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
  cedula VARCHAR(20) PRIMARY KEY,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(80) NOT NULL,
  correo_institucional VARCHAR(120) NOT NULL UNIQUE,
  promedio DECIMAL(5,2),
  estado_academico ENUM('activo', 'inactivo', 'egresado', 'graduado') NOT NULL DEFAULT 'activo',
  fk_id_carrera INT,
  fecha_ingreso DATE NULL DEFAULT NULL,
  membresia_activa TINYINT(1) NOT NULL DEFAULT 1,
  password VARCHAR(255) NOT NULL, -- Added for JWT Auth
  rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante', -- Usado por el login y los middlewares de autorización
  foto_url VARCHAR(255) NULL DEFAULT NULL, -- URL de la foto de perfil (portal del estudiante)
  -- 1 = la cuenta tiene una contraseña temporal y debe cambiarla al entrar.
  debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0,
  fk_id_institucion INT NULL, -- Agregado en migration_v2_multi_tenant
  CONSTRAINT fk_estudiante_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera),
  CONSTRAINT fk_estudiante_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion)
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
-- Migration v2: Multi-tenant support
-- Adds institution management and superadmin role
SET NAMES utf8mb4;
USE codevote_db;

-- 1. New table: institucion (organizations/institutions)
CREATE TABLE IF NOT EXISTS institucion (
    id_institucion INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL DEFAULT 'universidad',
    descripcion TEXT NULL,
    logo_url VARCHAR(500) NULL,
    colores_json JSON NULL COMMENT 'Paleta de colores personalizable: {primary, secondary, ...}',
    config_json JSON NULL COMMENT 'Configuración institucional: {requiere_promedio, tipos_proceso, ...}',
    email_contacto VARCHAR(255) NULL,
    telefono VARCHAR(50) NULL,
    direccion TEXT NULL,
    sitio_web VARCHAR(500) NULL,
    dominio_email VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stored Procedure for Idempotent Column Additions
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _cv_migration_v2()
BEGIN
  -- Add slug if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'slug') THEN
    ALTER TABLE institucion ADD COLUMN slug VARCHAR(100) NULL UNIQUE AFTER nombre;
  END IF;
  -- Add colores_json if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'colores_json') THEN
    ALTER TABLE institucion ADD COLUMN colores_json JSON NULL AFTER logo_url;
  END IF;
  -- Add config_json if missing  
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'config_json') THEN
    ALTER TABLE institucion ADD COLUMN config_json JSON NULL AFTER colores_json;
  END IF;
  -- Drop old config column if exists
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institucion' AND COLUMN_NAME = 'config') THEN
    ALTER TABLE institucion DROP COLUMN config;
  END IF;
  -- Add fk_id_institucion to estudiante if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE estudiante ADD COLUMN fk_id_institucion INT NULL;
    ALTER TABLE estudiante ADD CONSTRAINT fk_estudiante_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
  -- Add fk_id_institucion to proceso_electoral if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fk_id_institucion') THEN
    ALTER TABLE proceso_electoral ADD COLUMN fk_id_institucion INT NULL;
    ALTER TABLE proceso_electoral ADD CONSTRAINT fk_proceso_institucion FOREIGN KEY (fk_id_institucion) REFERENCES institucion(id_institucion);
  END IF;
END //
DELIMITER ;
CALL _cv_migration_v2();
DROP PROCEDURE IF EXISTS _cv_migration_v2;

-- Change tipo_proceso from ENUM to VARCHAR (safe: MySQL keeps existing data)
ALTER TABLE proceso_electoral MODIFY COLUMN tipo_proceso VARCHAR(60) NOT NULL;
-- Migration v3: Dynamic Electoral Rules
-- Adds support for organization requirements such as seniority (fecha_ingreso) and active membership (membresia_activa).
SET NAMES utf8mb4;
USE codevote_db;

DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _cv_migration_v3()
BEGIN
  -- Add fecha_ingreso if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'fecha_ingreso') THEN
    ALTER TABLE estudiante ADD COLUMN fecha_ingreso DATE NULL AFTER fk_id_carrera;
  END IF;

  -- Add membresia_activa if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'membresia_activa') THEN
    ALTER TABLE estudiante ADD COLUMN membresia_activa TINYINT(1) NOT NULL DEFAULT 1 AFTER fecha_ingreso;
  END IF;
END //
DELIMITER ;
CALL _cv_migration_v3();
DROP PROCEDURE IF EXISTS _cv_migration_v3;
-- ==============================================================================
-- MIGRACIÓN V4: Unificación de SuperAdmin bajo OTP
-- ==============================================================================

-- 1. Actualizar el ENUM del rol en la tabla estudiante para incluir 'superadmin'
-- Es idempotente: si ya tiene el rol, simplemente lo re-declara con el mismo tipo.
ALTER TABLE estudiante 
  MODIFY COLUMN rol ENUM('estudiante', 'admin', 'candidato', 'superadmin') NOT NULL DEFAULT 'estudiante';

-- 2. Eliminar la tabla aislada de superadmin (si existe)
DROP TABLE IF EXISTS superadmin;
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
-- =============================================================================
-- Migración: cambio de contraseña obligatorio en el primer ingreso
-- Fecha: 2026-07-29
-- =============================================================================
-- Las cuentas que crea el administrador nacen con una contraseña temporal
-- compartida, así que deben cambiarla la primera vez que entran. La bandera se
-- pone en 1 al crear la cuenta (o cuando el admin reinicia la contraseña) y
-- vuelve a 0 cuando la persona la cambia desde su perfil.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_cambio_password_obligatorio.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'debe_cambiar_password'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE estudiante ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- =============================================================================
-- Migración de datos: cédulas de prueba → cédulas ecuatorianas VÁLIDAS
-- Fecha: 2026-07-29
-- =============================================================================
-- El backend ahora exige el dígito verificador del Registro Civil. Las cédulas
-- cargadas originalmente (17000000XX) eran secuenciales y 20 de 22 NO pasan el
-- algoritmo, así que se reemplazan por cédulas válidas equivalentes.
--
-- `estudiante.cedula` es clave primaria referenciada por 4 tablas
-- (candidato, codigo_voto, notificacion, lista_candidata), por eso se
-- desactivan temporalmente las comprobaciones de clave foránea y se actualizan
-- padre e hijas dentro de UNA transacción.
--
-- IDEMPOTENTE: el mapeo se aplica buscando las cédulas VIEJAS. Tras la primera
-- ejecución ya no existen, y ninguna cédula nueva coincide con una vieja, así
-- que volver a ejecutarla no cambia nada.
--
-- ⚠️ Las sesiones abiertas quedan inválidas (el JWT lleva la cédula anterior):
--    hay que volver a iniciar sesión. El correo y la contraseña NO cambian.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_cedulas_validas.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

CREATE TEMPORARY TABLE mapa_cedula (
  vieja CHAR(10) PRIMARY KEY,
  nueva CHAR(10) NOT NULL UNIQUE
);

INSERT INTO mapa_cedula (vieja, nueva) VALUES
  ('1700000001','1710000009'),
  ('1700000002','1710000017'),
  ('1700000003','1710000025'),
  ('1700000004','1710000033'),
  ('1700000005','1710000041'),
  ('1700000006','1710000058'),
  ('1700000007','1710000066'),
  ('1700000008','1710000074'),
  ('1700000009','1710000082'),
  ('1700000010','1710000090'),
  ('1700000011','1710000108'),
  ('1700000012','1710000116'),
  ('1700000013','1710000124'),
  ('1700000014','1710000132'),
  ('1700000015','1710000140'),
  ('1700000016','1710000157'),
  ('1700000017','1710000165'),
  ('1700000018','1710000173'),
  ('1700000019','1710000181'),
  ('1700000020','1710000199'),
  ('1700000021','1710000207'),
  ('1700000022','1710000215');

SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

UPDATE candidato       c JOIN mapa_cedula m ON m.vieja = c.fk_cedula_estudiante  SET c.fk_cedula_estudiante  = m.nueva;
UPDATE codigo_voto    cv JOIN mapa_cedula m ON m.vieja = cv.fk_cedula_estudiante SET cv.fk_cedula_estudiante = m.nueva;
UPDATE notificacion    n JOIN mapa_cedula m ON m.vieja = n.fk_cedula_estudiante  SET n.fk_cedula_estudiante  = m.nueva;
UPDATE lista_candidata l JOIN mapa_cedula m ON m.vieja = l.fk_cedula_responsable SET l.fk_cedula_responsable = m.nueva;
UPDATE estudiante      e JOIN mapa_cedula m ON m.vieja = e.cedula                SET e.cedula                = m.nueva;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;

-- Verificación: no deben quedar referencias huérfanas (todo debe dar 0).
SELECT 'candidato huérfanos'  AS chequeo, COUNT(*) AS filas FROM candidato       c LEFT JOIN estudiante e ON e.cedula = c.fk_cedula_estudiante  WHERE e.cedula IS NULL
UNION ALL SELECT 'codigo_voto huérfanos',  COUNT(*) FROM codigo_voto            cv LEFT JOIN estudiante e ON e.cedula = cv.fk_cedula_estudiante WHERE e.cedula IS NULL
UNION ALL SELECT 'notificacion huérfanas', COUNT(*) FROM notificacion            n LEFT JOIN estudiante e ON e.cedula = n.fk_cedula_estudiante  WHERE e.cedula IS NULL
UNION ALL SELECT 'listas sin responsable', COUNT(*) FROM lista_candidata         l LEFT JOIN estudiante e ON e.cedula = l.fk_cedula_responsable WHERE l.fk_cedula_responsable IS NOT NULL AND e.cedula IS NULL;
-- =============================================================================
-- Migración: Código de verificación público del comprobante
-- Fecha: 2026-07-29
-- =============================================================================
-- Agrega `codigo_verificacion` a codigo_voto: un identificador público OPACO y
-- aleatorio (UUID v4) que el estudiante puede usar para comprobar que su voto
-- quedó registrado, SIN exponer `codigo_hash` ni la opción elegida.
--
-- Nota de privacidad: se genera con bytes aleatorios (formato v4), NO con la
-- función UUID() de MySQL, que produce UUID v1 e incrusta marca de tiempo y
-- dirección MAC. Un UUID v1 sería correlacionable con la hora del voto y
-- debilitaría el anonimato.
--
-- IDEMPOTENTE: agrega la columna, rellena las filas existentes, crea el índice
-- único y recién entonces la marca NOT NULL. Re-ejecutarla no altera nada.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_codigo_verificacion.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- 1. Columna (nullable de entrada, para poder rellenar las filas existentes).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_voto' AND COLUMN_NAME = 'codigo_verificacion'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE codigo_voto ADD COLUMN codigo_verificacion CHAR(36) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Backfill de comprobantes anteriores con un UUID v4 aleatorio por fila.
UPDATE codigo_voto
SET codigo_verificacion = LOWER(CONCAT(
      HEX(RANDOM_BYTES(4)), '-',
      HEX(RANDOM_BYTES(2)), '-',
      '4', SUBSTRING(HEX(RANDOM_BYTES(2)), 2, 3), '-',
      SUBSTRING('89ab', 1 + FLOOR(RAND() * 4), 1), SUBSTRING(HEX(RANDOM_BYTES(2)), 2, 3), '-',
      HEX(RANDOM_BYTES(6))
    ))
WHERE codigo_verificacion IS NULL;

-- 3. Índice único (el código es la referencia pública del comprobante).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'codigo_voto' AND INDEX_NAME = 'uq_codigo_verificacion'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE codigo_voto ADD CONSTRAINT uq_codigo_verificacion UNIQUE (codigo_verificacion)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Ya sin nulos: se exige siempre presente.
ALTER TABLE codigo_voto MODIFY COLUMN codigo_verificacion CHAR(36) NOT NULL;
-- =============================================================================
-- Migración: Imagen principal de la lista candidata
-- Fecha: 2026-07-29
-- =============================================================================
-- IDEMPOTENTE. Agrega la columna foto_url a lista_candidata (URL https de la
-- imagen principal de la lista). Se aplica a mano en producción ANTES de
-- desplegar el código que la consume:
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_foto_lista_candidata.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'foto_url'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- =============================================================================
-- Migración: Foto de perfil del estudiante
-- Fecha: 2026-07-29
-- =============================================================================
-- IDEMPOTENTE. Agrega la columna foto_url a estudiante (URL de la imagen de
-- perfil). Se aplica a mano en producción ANTES de desplegar el código que la
-- consume:
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_foto_perfil.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'foto_url'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE estudiante ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- =============================================================================
-- Migración: Portal del candidato + archivado de procesos + retiro de listas
-- Fecha: 2026-07-29
-- =============================================================================
-- IDEMPOTENTE: se puede ejecutar varias veces sin error. La base de producción
-- ya existe y el pipeline NO corre migraciones automáticamente, así que este
-- archivo se aplica a mano:
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_portal_candidato.sql
--
-- No borra ni modifica datos existentes: solo agrega columnas/valores nuevos.
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- -----------------------------------------------------------------------------
-- 1. Rol 'candidato' en estudiante.
--    MODIFY COLUMN es idempotente (re-ejecutar deja la misma definición).
--    El candidato conserva el acceso a votación (las rutas de voto solo exigen
--    autenticación, no un rol específico).
-- -----------------------------------------------------------------------------
ALTER TABLE estudiante
  MODIFY COLUMN rol ENUM('estudiante', 'admin', 'candidato') NOT NULL DEFAULT 'estudiante';

-- -----------------------------------------------------------------------------
-- 2. Archivado de procesos electorales (columna archivado_at).
--    Se prefiere una marca de tiempo NULL en vez de tocar el ENUM `estado`,
--    para no alterar la lógica de estados existente. Un proceso archivado
--    desaparece de las consultas activas pero se conserva para historial.
-- -----------------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'archivado_at'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN archivado_at DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 3. Motivo de rechazo de una lista candidata (observación del administrador).
-- -----------------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'motivo_rechazo'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN motivo_rechazo VARCHAR(250) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4. Propietario/responsable de la lista candidata (estudiante candidato).
--    Columna + clave foránea, ambas agregadas de forma idempotente.
-- -----------------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'fk_cedula_responsable'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN fk_cedula_responsable CHAR(10) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata'
    AND CONSTRAINT_NAME = 'fk_lista_responsable'
);
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD CONSTRAINT fk_lista_responsable FOREIGN KEY (fk_cedula_responsable) REFERENCES estudiante(cedula)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- =============================================================================
-- Migración de datos: promedios de escala 0–10 a escala 0–100
-- Fecha: 2026-07-29
-- =============================================================================
-- La universidad maneja notas sobre 100. Los estudiantes cargados originalmente
-- tenían el promedio en escala 0–10, así que se multiplican por 10.
--
-- SEGURA / IDEMPOTENTE: solo convierte los que TODAVÍA están en escala 0–10
-- (promedio <= 10). Si se ejecuta de nuevo, los ya convertidos (> 10) quedan
-- fuera del WHERE y no se vuelven a multiplicar. Se limita a 100 por seguridad.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_promedios_a_100.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

UPDATE estudiante
SET promedio = LEAST(ROUND(promedio * 10, 2), 100)
WHERE promedio IS NOT NULL AND promedio <= 10;
-- =============================================================================
-- Migración: asignación administrativa de candidaturas
-- Fecha: 2026-07-30
-- =============================================================================
-- El candidato ya no elige libremente proceso, carrera ni papeleta: el
-- administrador le asigna UNA papeleta (votación) y el portal del candidato
-- trabaja solo con esa asignación.
--
-- fk_cedula_estudiante es UNIQUE: cada persona tiene como máximo una asignación.
-- Reasignar actualiza esa misma fila; retirar la elimina físicamente.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_asignacion_candidatura.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

CREATE TABLE IF NOT EXISTS asignacion_candidatura (
  id_asignacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_votacion INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activa', 'retirada') NOT NULL DEFAULT 'activa',
  -- Una sola asignación por persona.
  CONSTRAINT uq_asignacion_estudiante UNIQUE (fk_cedula_estudiante),
  CONSTRAINT fk_asignacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  CONSTRAINT fk_asignacion_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)
);
-- =============================================================================
-- Migración: la carrera pasa del PROCESO a la VOTACIÓN
-- Fecha: 2026-07-30
-- =============================================================================
-- Nuevo modelo de representantes por carrera:
--
--   proceso_electoral  "Representantes de Carrera 2026"   (general, sin carrera)
--     └── votacion     "Representante TICs"          -> fk_id_carrera = TICs
--     └── votacion     "Representante Arquitectura"   -> fk_id_carrera = Arquitectura
--           └── lista_candidata  -> fk_id_votacion (compite en esa papeleta)
--
-- Cambios:
--   1. votacion.fk_id_carrera   -> NULL = papeleta global; con valor = categoría
--                                  de esa carrera. Único por (proceso, carrera):
--                                  no puede haber dos papeletas de la misma
--                                  carrera en un mismo proceso.
--   2. lista_candidata.fk_id_votacion -> la papeleta en la que compite la lista.
--   3. proceso_electoral.fk_id_carrera queda SIN USO (la carrera vive en la
--      votación). Se pone a NULL por si algún proceso la tenía.
--
-- Las fechas del proceso (convocatoria, inscripción, votación, posesión) se
-- mantienen tal cual.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_carrera_por_votacion.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- --- 1. Carrera en la votación ----------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND COLUMN_NAME = 'fk_id_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD COLUMN fk_id_carrera INT NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND CONSTRAINT_NAME = 'fk_votacion_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD CONSTRAINT fk_votacion_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Una sola papeleta por carrera dentro de un proceso. En MySQL un índice único
-- admite varios NULL, así que las papeletas globales no se ven afectadas.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND INDEX_NAME = 'uq_votacion_proceso_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD CONSTRAINT uq_votacion_proceso_carrera UNIQUE (fk_id_proceso, fk_id_carrera)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- 2. Votación (papeleta) a la que pertenece cada lista --------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND COLUMN_NAME = 'fk_id_votacion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD COLUMN fk_id_votacion INT NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lista_candidata' AND CONSTRAINT_NAME = 'fk_lista_votacion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE lista_candidata ADD CONSTRAINT fk_lista_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: si el proceso de la lista tiene EXACTAMENTE una votación, se asigna
-- esa. Si tiene varias, queda NULL y se reporta al final para resolverlo a mano.
UPDATE lista_candidata l
JOIN (
  SELECT fk_id_proceso, MIN(id_votacion) AS id_votacion, COUNT(*) AS cuantas
  FROM votacion GROUP BY fk_id_proceso
) v ON v.fk_id_proceso = l.fk_id_proceso AND v.cuantas = 1
SET l.fk_id_votacion = v.id_votacion
WHERE l.fk_id_votacion IS NULL;

-- --- 3. El proceso ya no lleva carrera --------------------------------------
UPDATE proceso_electoral SET fk_id_carrera = NULL WHERE fk_id_carrera IS NOT NULL;

-- --- 4. Pendientes por revisar ----------------------------------------------
SELECT id_lista, nombre_lista, fk_id_proceso,
       'lista SIN votacion: asignarle una papeleta desde el panel' AS pendiente
FROM lista_candidata WHERE fk_id_votacion IS NULL;
-- =============================================================================
-- Migración: imagen de procesos y papeletas
-- Fecha: 2026-07-30
-- =============================================================================
-- Imagen opcional (URL https) para el proceso electoral y para cada votación
-- (papeleta). Ejemplos: Consejo Estudiantil → imagen institucional de la UIDE;
-- Representante TICs → imagen de la carrera.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_foto_proceso_votacion.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'foto_url');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votacion' AND COLUMN_NAME = 'foto_url');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE votacion ADD COLUMN foto_url VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- =============================================================================
-- Migración: procesos electorales segmentados por carrera
-- Fecha: 2026-07-30
-- =============================================================================
-- 1. Carga las carreras de la facultad (sin borrar las existentes: hay
--    estudiantes referenciándolas por clave foránea).
-- 2. Agrega a proceso_electoral:
--      fk_id_carrera             -> NULL en procesos globales (consejo,
--                                   referéndum); obligatoria en los de
--                                   representante de carrera.
--      fecha_inicio_inscripcion  -> apertura del periodo de inscripción de listas
--      fecha_fin_inscripcion     -> cierre del periodo de inscripción
--      fecha_posesion            -> posesión de los electos
--
-- La carrera de una lista NO se duplica: se obtiene desde su proceso electoral.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_procesos_por_carrera.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- --- 1. Carreras -------------------------------------------------------------
-- Se insertan solo si no existen ya (por nombre).
INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Arquitectura') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Arquitectura');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Administración de Empresas') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Administración de Empresas');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Marketing e Inteligencia de Mercados') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Marketing e Inteligencia de Mercados');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Psicología Clínica') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Psicología Clínica');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'TICs') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'TICs');

INSERT INTO carrera (nombre_carrera)
SELECT * FROM (SELECT 'Derecho') AS nueva
WHERE NOT EXISTS (SELECT 1 FROM carrera WHERE nombre_carrera = 'Derecho');

-- --- 2. Columnas nuevas en proceso_electoral ---------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fk_id_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fk_id_carrera INT NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral'
    AND CONSTRAINT_NAME = 'fk_proceso_carrera');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD CONSTRAINT fk_proceso_carrera FOREIGN KEY (fk_id_carrera) REFERENCES carrera(id_carrera)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fecha_inicio_inscripcion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fecha_inicio_inscripcion DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fecha_fin_inscripcion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fecha_fin_inscripcion DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proceso_electoral' AND COLUMN_NAME = 'fecha_posesion');
SET @ddl := IF(@existe = 0,
  'ALTER TABLE proceso_electoral ADD COLUMN fecha_posesion DATETIME NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- --- 3. Aviso: procesos de representante que quedaron sin carrera ------------
SELECT id_proceso, nombre_proceso,
       'representante_carrera SIN carrera: asignarle una desde el panel' AS pendiente
FROM proceso_electoral
WHERE tipo_proceso = 'representante_carrera' AND fk_id_carrera IS NULL;
-- =============================================================================
-- Migración: el responsable de la lista es su Presidente
-- Fecha: 2026-08-01
-- =============================================================================
-- Regla nueva: SOLO el responsable de la candidatura tiene rol 'candidato' y
-- acceso al Portal del candidato. Los demás integrantes (vicepresidente,
-- secretario, tesorero, vocales) siguen siendo 'estudiante': se registran en la
-- tabla `candidato` únicamente como integrantes de la lista.
--
-- Cambios:
--   1. `candidato.cargo` pasa a valores capitalizados (Presidente, ...).
--   2. Índice único que garantiza UN solo Presidente por lista.
--   3. Índice único que impide repetir a la misma persona dentro de una lista.
--   4. Backfill: cada lista queda con su responsable como Presidente, y se
--      degradan a 'estudiante' los integrantes que no son responsables.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin efectos secundarios.
--
-- OJO: MySQL hace COMMIT implícito en cada DDL, así que este script NO es una
-- transacción única. Saca un respaldo antes de correrlo (ver README).
--
-- Uso (la base se indica en la línea de comandos; el script no la fija):
--   mysql -u root -p codevote_db < 2026-08-01_responsable_presidente.sql
-- =============================================================================

SET NAMES utf8mb4;
-- Que un valor inesperado de `cargo` haga fallar el ALTER en vez de truncarse
-- silenciosamente a cadena vacía.
SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',STRICT_ALL_TABLES');

-- -----------------------------------------------------------------------------
-- 0. Punto de partida limpio
-- -----------------------------------------------------------------------------
-- `lista_presidente` es una columna generada a partir de `cargo`; mientras
-- exista, MySQL no deja modificar el tipo de `cargo`. Se elimina al principio y
-- se vuelve a crear al final: así la segunda corrida hace exactamente lo mismo
-- que la primera. Al soltar la columna cae con ella su índice único.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'candidato'
      AND column_name = 'lista_presidente') > 0,
  'ALTER TABLE candidato DROP COLUMN lista_presidente',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 1. Cargos capitalizados
-- -----------------------------------------------------------------------------
-- No se puede pasar por un ENUM que admita las dos grafías: MySQL compara los
-- valores de un ENUM sin distinguir mayúsculas, así que 'presidente' y
-- 'Presidente' serían el mismo valor duplicado (error 1291). El paso intermedio
-- es un VARCHAR.
ALTER TABLE candidato MODIFY COLUMN cargo VARCHAR(20) NOT NULL;

UPDATE candidato SET cargo = 'Presidente'     WHERE cargo = 'presidente';
UPDATE candidato SET cargo = 'Vicepresidente' WHERE cargo = 'vicepresidente';
UPDATE candidato SET cargo = 'Secretario'     WHERE cargo = 'secretario';
UPDATE candidato SET cargo = 'Tesorero'       WHERE cargo = 'tesorero';
UPDATE candidato SET cargo = 'Vocal'          WHERE cargo = 'vocal';

-- -----------------------------------------------------------------------------
-- 2. Una sola fila por persona en cada lista
-- -----------------------------------------------------------------------------
-- Requisito del índice único de 5.b. Se conserva la fila de Presidente y, si no
-- la hay, la más antigua. Las descartadas son duplicados exactos de persona +
-- lista, así que sus validaciones de requisitos se borran con ellas: si no, la
-- clave foránea impediría eliminarlas.
DROP TEMPORARY TABLE IF EXISTS tmp_integrante_conservado;
CREATE TEMPORARY TABLE tmp_integrante_conservado (id_candidato INT PRIMARY KEY);
INSERT INTO tmp_integrante_conservado (id_candidato)
SELECT COALESCE(
         MIN(CASE WHEN cargo = 'Presidente' THEN id_candidato END),
         MIN(id_candidato)
       )
  FROM candidato
 GROUP BY fk_id_lista, fk_cedula_estudiante;

DELETE FROM validacion_requisito
 WHERE fk_id_candidato NOT IN (SELECT id_candidato FROM tmp_integrante_conservado);

DELETE FROM candidato
 WHERE id_candidato NOT IN (SELECT id_candidato FROM tmp_integrante_conservado);

-- -----------------------------------------------------------------------------
-- 3. El responsable de cada lista es su Presidente
-- -----------------------------------------------------------------------------
-- 3.a. Un Presidente que NO es el responsable baja a Vocal: el cargo queda
--      reservado a quien responde por la lista. Va ANTES de ascender al
--      responsable, para que el cargo esté libre y no haya conflicto.
UPDATE candidato c
  JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
   SET c.cargo = 'Vocal'
 WHERE c.cargo = 'Presidente'
   AND l.fk_cedula_responsable IS NOT NULL
   AND l.fk_cedula_responsable <> c.fk_cedula_estudiante;

-- 3.b. El responsable que ya figuraba como integrante asciende a Presidente.
UPDATE candidato c
  JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
   SET c.cargo = 'Presidente'
 WHERE l.fk_cedula_responsable = c.fk_cedula_estudiante
   AND c.cargo <> 'Presidente';

-- 3.c. El responsable que no figuraba se inserta como Presidente. Se pasa por
--      una tabla temporal porque MySQL no admite consultar la misma tabla en la
--      que se inserta.
DROP TEMPORARY TABLE IF EXISTS tmp_presidente_faltante;
CREATE TEMPORARY TABLE tmp_presidente_faltante (cedula CHAR(10), id_lista INT);
INSERT INTO tmp_presidente_faltante (cedula, id_lista)
SELECT l.fk_cedula_responsable, l.id_lista
  FROM lista_candidata l
 WHERE l.fk_cedula_responsable IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM candidato c
      WHERE c.fk_id_lista = l.id_lista
        AND c.fk_cedula_estudiante = l.fk_cedula_responsable
   );

INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista)
SELECT 'Presidente', 0, NULL, cedula, id_lista FROM tmp_presidente_faltante;

-- 3.d. Listas SIN responsable (las creaba la administración, que no fija dueño):
--      adoptan como responsable al Presidente que ya tenían. Sin esto quedarían
--      con `responsable: null` y nadie podría abrir su portal. Si hubiera varios
--      Presidentes manda el de menor id y el resto baja a Vocal, para que el
--      índice único de 5.a pueda crearse.
DROP TEMPORARY TABLE IF EXISTS tmp_presidente_unico;
CREATE TEMPORARY TABLE tmp_presidente_unico (id_candidato INT PRIMARY KEY);
INSERT INTO tmp_presidente_unico (id_candidato)
SELECT MIN(id_candidato) FROM candidato WHERE cargo = 'Presidente' GROUP BY fk_id_lista;

UPDATE candidato SET cargo = 'Vocal'
 WHERE cargo = 'Presidente'
   AND id_candidato NOT IN (SELECT id_candidato FROM tmp_presidente_unico);

UPDATE lista_candidata l
  JOIN candidato c ON c.fk_id_lista = l.id_lista AND c.cargo = 'Presidente'
  JOIN estudiante e ON e.cedula = c.fk_cedula_estudiante
   SET l.fk_cedula_responsable = c.fk_cedula_estudiante
 WHERE l.fk_cedula_responsable IS NULL
   -- Una cuenta de administración no puede quedar como responsable: esa lista
   -- se queda sin dueño y se le asigna con PATCH /listas-candidatas/:id/responsable.
   AND e.rol <> 'admin';

-- -----------------------------------------------------------------------------
-- 4. ENUM definitivo
-- -----------------------------------------------------------------------------
ALTER TABLE candidato
  MODIFY COLUMN cargo ENUM(
    'Presidente', 'Vicepresidente', 'Secretario', 'Tesorero', 'Vocal'
  ) NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Restricciones de unicidad
-- -----------------------------------------------------------------------------
-- 5.a. Un solo Presidente por lista. La columna generada vale el id de la lista
--      solo en la fila del presidente y NULL en las demás; como MySQL no
--      considera duplicados los NULL en un índice único, la restricción afecta
--      exclusivamente a esa fila.
ALTER TABLE candidato
  ADD COLUMN lista_presidente INT
    GENERATED ALWAYS AS (CASE WHEN cargo = 'Presidente' THEN fk_id_lista END) STORED,
  ADD CONSTRAINT uq_candidato_presidente_por_lista UNIQUE (lista_presidente);

-- 5.b. La misma persona no puede aparecer dos veces en la misma lista.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'candidato'
      AND index_name = 'uq_candidato_estudiante_lista') > 0,
  'DO 0',
  'ALTER TABLE candidato
     ADD CONSTRAINT uq_candidato_estudiante_lista UNIQUE (fk_id_lista, fk_cedula_estudiante)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 6. Roles: solo el responsable conserva 'candidato'
-- -----------------------------------------------------------------------------
-- 6.a. El responsable necesita la asignación de la papeleta en la que compite
--      para operar el portal. Solo se crea si no tiene ninguna: nunca se pisa
--      una asignación existente.
INSERT INTO asignacion_candidatura (fk_cedula_estudiante, fk_id_votacion, estado)
SELECT l.fk_cedula_responsable, MIN(l.fk_id_votacion), 'activa'
  FROM lista_candidata l
  JOIN estudiante e ON e.cedula = l.fk_cedula_responsable
 WHERE l.fk_cedula_responsable IS NOT NULL
   AND l.fk_id_votacion IS NOT NULL
   AND e.rol <> 'admin'
   AND NOT EXISTS (
     SELECT 1 FROM asignacion_candidatura a
      WHERE a.fk_cedula_estudiante = l.fk_cedula_responsable
   )
 GROUP BY l.fk_cedula_responsable;

-- 6.b. Un integrante que no es responsable de ninguna lista ni tiene asignación
--      activa vuelve a 'estudiante'. Los admin no se tocan.
UPDATE estudiante e
   SET e.rol = 'estudiante'
 WHERE e.rol = 'candidato'
   AND NOT EXISTS (SELECT 1 FROM lista_candidata l WHERE l.fk_cedula_responsable = e.cedula)
   AND NOT EXISTS (
     SELECT 1 FROM asignacion_candidatura a
      WHERE a.fk_cedula_estudiante = e.cedula AND a.estado = 'activa'
   );

-- 6.c. El responsable de una lista siempre debe tener rol 'candidato'.
UPDATE estudiante e
   SET e.rol = 'candidato'
 WHERE e.rol = 'estudiante'
   AND EXISTS (SELECT 1 FROM lista_candidata l WHERE l.fk_cedula_responsable = e.cedula);

DROP TEMPORARY TABLE IF EXISTS tmp_integrante_conservado;
DROP TEMPORARY TABLE IF EXISTS tmp_presidente_faltante;
DROP TEMPORARY TABLE IF EXISTS tmp_presidente_unico;

SELECT 'Migración 2026-08-01_responsable_presidente aplicada.' AS resultado;
-- =============================================================================
-- Migración: un solo comprobante por estudiante y papeleta
-- Fecha: 2026-08-03
-- =============================================================================
-- Añade a `codigo_voto` la restricción
--
--     UNIQUE (fk_id_votacion, fk_cedula_estudiante)  ->  uq_codigo_votante
--
-- Es la última defensa contra el DOBLE VOTO. El controlador comprueba antes si
-- el estudiante ya votó, pero entre esa comprobación y el INSERT hay una
-- ventana: dos peticiones simultáneas del mismo estudiante pueden pasar las dos
-- y generar dos comprobantes. El código ya captura el ER_DUP_ENTRY que produce
-- esta restricción y responde 409; sin ella, esa defensa no existe.
--
-- La restricción está en `db/schema.sql` desde el 27/07/2026, así que las
-- instalaciones nuevas ya la traen. Esta migración es para las bases creadas
-- antes de esa fecha, que se quedaron sin ella.
--
-- SEGURA: no borra ni modifica ningún comprobante. Si encuentra duplicados,
-- los reporta y ABORTA sin tocar nada, para que se resuelvan a mano: un
-- comprobante duplicado es evidencia electoral y la decisión de cuál conservar
-- no es automatizable.
--
-- IDEMPOTENTE: si el índice ya existe, no hace nada y lo dice.
--
-- Uso (la base se indica en la línea de comandos):
--   mysql -u root -p codevote_db < 2026-08-03_uq_codigo_votante.sql
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. Diagnóstico: ¿hay estudiantes con más de un comprobante en la misma papeleta?
-- -----------------------------------------------------------------------------
-- Se muestra SIEMPRE y antes de tocar nada. Si sale vacío, no hay duplicados.
SELECT
  cv.fk_id_votacion                    AS papeleta,
  v.titulo_papeleta                    AS titulo,
  cv.fk_cedula_estudiante              AS cedula,
  COUNT(*)                             AS comprobantes,
  GROUP_CONCAT(cv.id_codigo ORDER BY cv.id_codigo) AS ids_a_revisar
FROM codigo_voto cv
LEFT JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
GROUP BY cv.fk_id_votacion, v.titulo_papeleta, cv.fk_cedula_estudiante
HAVING COUNT(*) > 1
ORDER BY comprobantes DESC, papeleta;

-- -----------------------------------------------------------------------------
-- 2. Aplicación
-- -----------------------------------------------------------------------------
-- Va dentro de un procedimiento porque SIGNAL —la única forma de abortar con un
-- mensaje legible— no se admite ni suelto de forma condicional ni en PREPARE.
DROP PROCEDURE IF EXISTS aplicar_uq_codigo_votante;

DELIMITER $$

CREATE PROCEDURE aplicar_uq_codigo_votante()
BEGIN
  DECLARE v_existe INT DEFAULT 0;
  DECLARE v_duplicados INT DEFAULT 0;
  DECLARE v_mensaje TEXT;

  SELECT COUNT(*) INTO v_existe
    FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name   = 'codigo_voto'
     AND index_name   = 'uq_codigo_votante';

  IF v_existe > 0 THEN
    SELECT 'El índice uq_codigo_votante ya existe: no hay nada que aplicar.' AS resultado;
  ELSE
    SELECT COUNT(*) INTO v_duplicados FROM (
      SELECT 1
        FROM codigo_voto
       GROUP BY fk_id_votacion, fk_cedula_estudiante
      HAVING COUNT(*) > 1
    ) AS d;

    IF v_duplicados > 0 THEN
      -- MESSAGE_TEXT admite 128 caracteres como mucho: el detalle de cada
      -- duplicado ya salió en el diagnóstico del paso 1.
      SET v_mensaje = CONCAT(
        'ABORTADO: ', v_duplicados,
        ' duplicado(s) papeleta+estudiante (ver listado arriba). Resuelvalos a mano: no se borra ningun comprobante.'
      );
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_mensaje;
    END IF;

    ALTER TABLE codigo_voto
      ADD CONSTRAINT uq_codigo_votante UNIQUE (fk_id_votacion, fk_cedula_estudiante);

    SELECT 'Indice uq_codigo_votante creado: el doble voto queda bloqueado en la base.' AS resultado;
  END IF;
END$$

DELIMITER ;

CALL aplicar_uq_codigo_votante();

DROP PROCEDURE IF EXISTS aplicar_uq_codigo_votante;
-- =============================================================================
-- Migración: inicio de sesión con código de un solo uso (OTP) por correo
-- Fecha: 2026-08-04
-- =============================================================================
-- El votante ya no escribe contraseña: indica su correo institucional (o su
-- cédula) y recibe un código de 6 dígitos en el correo. Esta tabla guarda esos
-- códigos mientras están vigentes.
--
-- Decisiones:
--   * Se guarda el SHA-256 del código, no el código. Con acceso de lectura a la
--     base no se puede suplantar a nadie: hay que interceptar el correo.
--   * `intentos` corta la fuerza bruta sobre un código de 6 dígitos.
--   * `usado_at` marca el consumo, de modo que un código sirve UNA sola vez
--     aunque el correo se reenvíe o quede en la bandeja.
--   * `ip` queda para auditoría de accesos.
--
-- La columna `password` de estudiante pasa a ser NULLABLE: las cuentas nuevas ya
-- no necesitan contraseña. No se borra la columna ni los hashes existentes para
-- poder volver atrás y porque AUTH_PASSWORD_FALLBACK=true reactiva el login por
-- contraseña como puerta de emergencia.
--
-- IDEMPOTENTE: re-ejecutarla no altera nada.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-08-04_login_otp.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- 1. Tabla de códigos de acceso.
CREATE TABLE IF NOT EXISTS codigo_acceso (
  id_codigo INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  -- SHA-256 en hexadecimal del código de 6 dígitos.
  codigo_hash CHAR(64) NOT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_at DATETIME NOT NULL,
  usado_at DATETIME NULL DEFAULT NULL,
  intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ip VARCHAR(45) NULL DEFAULT NULL,
  CONSTRAINT fk_codigo_acceso_estudiante
    FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula)
    ON DELETE CASCADE,
  INDEX idx_codigo_acceso_vigente (fk_cedula_estudiante, usado_at, expira_at)
);

-- 2. La contraseña deja de ser obligatoria.
SET @nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante' AND COLUMN_NAME = 'password'
);
SET @ddl := IF(@nullable = 'NO',
  'ALTER TABLE estudiante MODIFY COLUMN password VARCHAR(255) NULL DEFAULT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Con OTP no hay contraseña temporal que cambiar en el primer ingreso.
UPDATE estudiante SET debe_cambiar_password = 0 WHERE debe_cambiar_password = 1;
-- =============================================================================
-- Migración: recordatorios por correo y sanciones por no votar
-- Fecha: 2026-08-04
-- =============================================================================
-- Tres tablas:
--
--   aviso_papeleta         Qué avisos automáticos ya salieron por cada papeleta.
--                          Es la marca de idempotencia: la tarea corre cada
--                          minuto y sin esto reenviaría la convocatoria una y
--                          otra vez. La clave única (papeleta, tipo) garantiza
--                          que cada aviso sale UNA sola vez, incluso si dos
--                          instancias del servidor pasan a la vez.
--
--   recordatorio_programado  Envíos que la administración programa a mano desde
--                          el panel ("programar recordatorio"), con su fecha y
--                          hora. La misma tarea los despacha cuando llega el
--                          momento.
--
--   sancion_electoral      Registro de quien no votó en una papeleta cerrada.
--                          Se guarda como historial verificable, no solo como
--                          correo enviado. La clave única (papeleta, cédula)
--                          evita duplicarla si el cierre se reprocesa.
--
-- IMPORTANTE (anonimato): la sanción se deduce de `codigo_voto`, que prueba
-- QUIÉN participó pero no QUÉ votó. No se toca la tabla `voto`, que es anónima,
-- así que registrar una sanción no revela ni relaciona el sentido de ningún
-- voto.
--
-- IDEMPOTENTE: re-ejecutarla no altera nada.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-08-04_recordatorios_y_sanciones.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- 1. Avisos automáticos ya enviados por papeleta.
CREATE TABLE IF NOT EXISTS aviso_papeleta (
  id_aviso INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_votacion INT NOT NULL,
  -- convocatoria: se creó la papeleta.  apertura: empezó la votación.
  -- cierre_proximo: falta poco para cerrar.  sancion: se cerró y se sancionó.
  tipo ENUM('convocatoria', 'apertura', 'cierre_proximo', 'sancion') NOT NULL,
  enviado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  destinatarios INT NOT NULL DEFAULT 0,
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_aviso_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion) ON DELETE CASCADE,
  CONSTRAINT uq_aviso_papeleta UNIQUE (fk_id_votacion, tipo)
);

-- 2. Recordatorios que programa la administración.
CREATE TABLE IF NOT EXISTS recordatorio_programado (
  id_recordatorio INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  -- NULL = a todo el padrón del proceso; con valor = solo al de esa papeleta.
  fk_id_votacion INT NULL DEFAULT NULL,
  asunto VARCHAR(150) NOT NULL,
  mensaje VARCHAR(1000) NOT NULL,
  programado_para DATETIME NOT NULL,
  -- Si es 1, solo se envía a quienes todavía no han votado esa papeleta.
  solo_pendientes TINYINT(1) NOT NULL DEFAULT 1,
  enviado_at DATETIME NULL DEFAULT NULL,
  destinatarios INT NULL DEFAULT NULL,
  error VARCHAR(250) NULL DEFAULT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fk_cedula_creador CHAR(10) NULL DEFAULT NULL,
  CONSTRAINT fk_recordatorio_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso) ON DELETE CASCADE,
  CONSTRAINT fk_recordatorio_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion) ON DELETE CASCADE,
  INDEX idx_recordatorio_pendiente (enviado_at, programado_para)
);

-- 3. Sanciones por no votar.
CREATE TABLE IF NOT EXISTS sancion_electoral (
  id_sancion INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_votacion INT NOT NULL,
  motivo VARCHAR(150) NOT NULL DEFAULT 'No participó en la votación',
  fecha_sancion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activa', 'justificada', 'anulada') NOT NULL DEFAULT 'activa',
  observacion VARCHAR(250) NULL DEFAULT NULL,
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_sancion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula) ON DELETE CASCADE,
  CONSTRAINT fk_sancion_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion) ON DELETE CASCADE,
  CONSTRAINT uq_sancion_papeleta UNIQUE (fk_id_votacion, fk_cedula_estudiante)
);
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

SET FOREIGN_KEY_CHECKS = 1;
SET FOREIGN_KEY_CHECKS=1;
