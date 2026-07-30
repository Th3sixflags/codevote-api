-- =============================================================================
-- PREPARACIÓN DE LA BASE DE DATOS PARA LA EXPOSICIÓN DE CODEVOTE
-- Fecha: 2026-07-30
-- =============================================================================
-- Deja la base con:
--   * schininin@uide.edu.ec como ÚNICO admin (sus datos no se tocan). Steven
--     participa solo con esta cuenta de admin: NO tiene cuenta de estudiante.
--   * Solo las cuentas demo autorizadas, rol estudiante, contraseña
--     password123 (hash bcrypt), estado activo, debe_cambiar_password = 0 y
--     password_temporal_expira_at = NULL, para que entren directo durante la
--     exposición sin pantallas intermedias.
--   * Sin procesos, papeletas, listas, candidatos, votos ni comprobantes: todo
--     eso se creará en vivo desde el panel admin durante la demostración.
--
-- No cambia lógica ni endpoints del backend: es solo datos.
--
-- ⚠️ BASE DE DESTINO: ÚNICAMENTE el MySQL en Docker de AWS (contenedor
--    codevote-mysql). NUNCA contra el MySQL local de Homebrew: esa copia solo
--    tiene los datos de ejemplo (seed) y no es la de la demostración.
--
-- ⚠️ ANTES DE EJECUTAR, hacer el respaldo en archivo (fuera de este script):
--
--   sudo docker exec codevote-mysql mysqldump -u root -p --databases codevote_db \
--     > ~/backup_codevote_$(date +%F_%H%M).sql
--
-- El script además guarda copias dentro de la propia base (tablas bkp_demo_*),
-- y NO las sobrescribe si ya existen, para que un segundo intento no destruya
-- el respaldo original.
--
-- EJECUCIÓN (en el servidor de AWS, solo cuando se confirme todo):
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < preparar_demo.sql
--
-- Como red de seguridad, el PASO 2 aborta sin borrar nada si detecta que se
-- está apuntando a una base que no contiene las identidades de la lista (por
-- ejemplo, la copia local de Homebrew).
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- -----------------------------------------------------------------------------
-- PASO 0. Lista blanca de cuentas demo (única fuente de verdad del script)
-- -----------------------------------------------------------------------------
-- Cédulas, nombres, apellidos, carrera y promedio tomados de los que YA existían
-- en la base: no se inventa ninguna identidad.
--
-- Dos correos de la lista no coincidían con la base y se mapearon a la misma
-- persona (misma cédula, correo nuevo de la lista):
--   angmediname@uide.edu.ec  ->  Angel Fernando Medina Mendoza (antes anmediname)
--   paurojasgr@uide.edu.ec   ->  Paula Alejandra Rojas Granda  (antes parojasgr)
--
-- ⚠️ FALTA UNA IDENTIDAD: caduarteen@uide.edu.ec no existe en la base. Su fila
--    está abajo comentada: cuando proporcionen cédula, nombres y apellidos
--    reales, se descomenta y se completa. No se inventa la cédula.
--
-- ⚠️ EXCLUIDO A PROPÓSITO: stchinininca@uide.edu.ec (Steven Paul Chininin
--    Camacas). Steven se queda solo con su cuenta de admin schininin@uide.edu.ec,
--    así que esta cuenta de estudiante no se crea ni se conserva.
DROP TABLE IF EXISTS tmp_demo_autorizadas;
CREATE TABLE tmp_demo_autorizadas (
  cedula   VARCHAR(20) PRIMARY KEY,
  nombres  VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100) NOT NULL,
  correo   VARCHAR(150) NOT NULL UNIQUE,
  carrera  INT NOT NULL,
  promedio DECIMAL(5,2) NOT NULL
);

INSERT INTO tmp_demo_autorizadas (cedula, nombres, apellidos, correo, carrera, promedio) VALUES
  ('1751308865','Alejandro David','Morocho Grageda','almorochogr@uide.edu.ec',1,90.00),
  ('1105946139','Anyela Carolina','Carpio Torres','ancarpioto@uide.edu.ec',8,90.00),
  ('1105719619','Angel Fernando','Medina Mendoza','angmediname@uide.edu.ec',8,90.00),
  ('1950143857','Aurora Marina','Zhuma Jaramillo','auzhumaja@uide.edu.ec',8,90.00),
  ('1104549165','Carlo Sebastian','Carrion Espinosa','cacarriones@uide.edu.ec',1,90.00),
  ('1150425096','David Alejandro','Garcia Rojas','dagarciaro@uide.edu.ec',8,90.00),
  ('1105830812','Deyvi Hernan','Masache Rengel','demasachere@uide.edu.ec',1,90.00),
  ('0704567486','Derky Alejandro','Sanchez Granda','desanchezgr@uide.edu.ec',8,90.00),
  ('1104871916','Diego Fernando','Lopez Saquicela','dilopezsa@uide.edu.ec',1,90.00),
  ('1725450710','Edgar Anderson','Bustos Castillo','edbustosca@uide.edu.ec',8,90.00),
  ('1150028551','Felix','Rodas','ferodasme@uide.edu.ec',1,100.00),
  ('1105335093','Hector Antonio','Campoverde Rodriguez','hecampoverdero@uide.edu.ec',8,90.00),
  ('1105386898','Janneth Nayerly','Medina Cambisaca','jamedinaca@uide.edu.ec',8,90.00),
  ('1105078149','Jhosty Jhair','Soto Leon','jhsotole@uide.edu.ec',1,90.00),
  ('1105374936','Joseph','Cartuche Vicente','jocartuchevi@uide.edu.ec',8,90.00),
  ('1105853152','Maria Jose','Guanca Guaman','maguancagu@uide.edu.ec',8,90.00),
  ('0750799553','Milena Yamileth','Ordonez Leon','miordonezle@uide.edu.ec',8,90.00),
  ('1105181968','Paula Alejandra','Rojas Granda','paurojasgr@uide.edu.ec',8,90.00),
  ('1150296174','Santiago Alexander','Rios Rios','sariosri@uide.edu.ec',1,90.00),
  ('1105444176','Stephano Dilan','Galvez Perez','stgalvezpe@uide.edu.ec',8,90.00),
  ('1105703076','Yostin Daniel','Ruiz Sinche','yoruizsi@uide.edu.ec',8,90.00);
  -- ,('__CEDULA__','__NOMBRES__','__APELLIDOS__','caduarteen@uide.edu.ec',1,90.00);

SELECT 'PASO 0 OK: lista blanca cargada' AS estado,
       COUNT(*) AS cuentas_demo FROM tmp_demo_autorizadas;

-- -----------------------------------------------------------------------------
-- PASO 1. Verificación previa: si no existe el admin esperado, ABORTA sin borrar
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS demo_verificar_admin;
DELIMITER //
CREATE PROCEDURE demo_verificar_admin()
BEGIN
  IF (SELECT COUNT(*) FROM estudiante
      WHERE correo_institucional = 'schininin@uide.edu.ec' AND rol = 'admin') <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'ABORTADO: no existe schininin@uide.edu.ec con rol admin. No se borró nada.';
  END IF;
END//
DELIMITER ;
CALL demo_verificar_admin();
DROP PROCEDURE demo_verificar_admin;

SELECT 'PASO 1 OK: admin verificado' AS estado;

-- -----------------------------------------------------------------------------
-- PASO 2. Comprobaciones antes de borrar (abortan sin destruir nada)
-- -----------------------------------------------------------------------------
-- 2.a  ¿Es esta la base correcta? Si ninguna de las identidades autorizadas
--      existe aquí, casi seguro se está apuntando a la base de ejemplo (seed).
-- 2.b  ¿Choca alguna cédula con la del admin? Si el admin Steven usa su cédula
--      real (la misma de stchinininca@uide.edu.ec), el INSERT del PASO 6 fallaría
--      a mitad de camino: mejor detenerlo antes de borrar.
DROP PROCEDURE IF EXISTS demo_preflight;
DELIMITER //
CREATE PROCEDURE demo_preflight()
BEGIN
  DECLARE v_encontradas INT;
  DECLARE v_choque INT;
  DECLARE v_carreras INT;

  SELECT COUNT(*) INTO v_encontradas
  FROM tmp_demo_autorizadas a
  JOIN estudiante e ON e.cedula = a.cedula;

  IF v_encontradas = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'ABORTADO: base equivocada (ninguna identidad de la lista existe aqui). No se borro nada.';
  END IF;

  SELECT COUNT(*) INTO v_choque
  FROM tmp_demo_autorizadas a
  JOIN estudiante e ON e.cedula = a.cedula
  WHERE e.correo_institucional = 'schininin@uide.edu.ec';

  IF v_choque > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'ABORTADO: una cuenta demo tiene la misma cedula que el admin schininin. No se borro nada.';
  END IF;

  -- 2.c  Las carreras asignadas deben existir, o el INSERT del PASO 6 fallaría
  --      por clave foránea después de haber borrado todo.
  SELECT COUNT(*) INTO v_carreras
  FROM tmp_demo_autorizadas a
  LEFT JOIN carrera c ON c.id_carrera = a.carrera
  WHERE c.id_carrera IS NULL;

  IF v_carreras > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'ABORTADO: alguna carrera asignada a las cuentas demo no existe. No se borro nada.';
  END IF;
END//
DELIMITER ;
CALL demo_preflight();
DROP PROCEDURE demo_preflight;

-- Informativo: identidades de la lista que ya no están en la base (el script las
-- vuelve a crear con los datos guardados arriba, no inventa nada).
SELECT '--- IDENTIDADES AUTORIZADAS QUE NO ESTAN HOY EN LA BASE ---' AS reporte;
SELECT a.correo, a.cedula, CONCAT(a.nombres,' ',a.apellidos) AS nombre
FROM tmp_demo_autorizadas a
LEFT JOIN estudiante e ON e.cedula = a.cedula
WHERE e.cedula IS NULL;

SELECT 'PASO 2 OK: base correcta y sin choque de cedulas' AS estado;

-- -----------------------------------------------------------------------------
-- PASO 3. Respaldo dentro de la base (solo la primera vez)
-- -----------------------------------------------------------------------------
SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_estudiante');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_estudiante AS SELECT * FROM estudiante', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_proceso_electoral');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_proceso_electoral AS SELECT * FROM proceso_electoral', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_votacion');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_votacion AS SELECT * FROM votacion', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_lista_candidata');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_lista_candidata AS SELECT * FROM lista_candidata', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_candidato');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_candidato AS SELECT * FROM candidato', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_voto');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_voto AS SELECT * FROM voto', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SET @e := (SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bkp_demo_codigo_voto');
SET @s := IF(@e = 0, 'CREATE TABLE bkp_demo_codigo_voto AS SELECT * FROM codigo_voto', 'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SELECT 'PASO 3 OK: respaldo en tablas bkp_demo_*' AS estado;

-- -----------------------------------------------------------------------------
-- PASO 4. Limpieza de datos electorales, en orden seguro de claves foráneas
-- -----------------------------------------------------------------------------
START TRANSACTION;

DELETE FROM validacion_requisito;     -- depende de candidato
DELETE FROM asignacion_candidatura;   -- depende de estudiante y votacion
DELETE FROM candidato;                -- depende de lista_candidata y estudiante
DELETE FROM plan_trabajo;             -- depende de lista_candidata
DELETE FROM voto;                     -- depende de votacion y lista_candidata
DELETE FROM codigo_voto;              -- depende de votacion y estudiante
DELETE FROM acta_resultados;          -- depende de votacion
DELETE FROM veeduria;                 -- depende de votacion y veedor
DELETE FROM notificacion;             -- depende de estudiante
DELETE FROM lista_candidata;          -- depende de proceso, votacion y estudiante
DELETE FROM votacion;                 -- depende de proceso
DELETE FROM cronograma;               -- depende de proceso y responsable
DELETE FROM proceso_electoral;

-- -----------------------------------------------------------------------------
-- PASO 5. Eliminar todos los estudiantes menos el admin Steven
-- -----------------------------------------------------------------------------
DELETE FROM estudiante WHERE correo_institucional <> 'schininin@uide.edu.ec';

-- -----------------------------------------------------------------------------
-- PASO 6. Crear las cuentas demo autorizadas
-- -----------------------------------------------------------------------------
-- La contraseña se guarda SIEMPRE como hash bcrypt (coste 12), nunca en texto
-- plano. Este hash corresponde a 'password123' (verificado con bcryptjs).
SET @hash := '$2b$12$oFO4nWL/3Q9SA/X.srSbZO0FU5YX0IHtFS4QiC9QzUE7BXkh2.QDu';

-- debe_cambiar_password = 0 -> entran directo con password123, sin la pantalla
-- de cambio obligatorio (auth.routes.ts devuelve la bandera y Login.jsx redirige
-- a /cambiar-password solo cuando vale 1). Igual pueden cambiarla desde su
-- perfil si quieren.
INSERT INTO estudiante
  (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico,
   fk_id_carrera, password, rol, debe_cambiar_password)
SELECT a.cedula, a.nombres, a.apellidos, a.correo, a.promedio, 'activo',
       a.carrera, @hash, 'estudiante', 0
FROM tmp_demo_autorizadas a;

COMMIT;

-- Si la base tiene la columna password_temporal_expira_at (no existe en el
-- esquema del repositorio), se deja en NULL en las cuentas demo.
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estudiante'
             AND COLUMN_NAME = 'password_temporal_expira_at');
SET @s := IF(@e = 1,
  'UPDATE estudiante SET password_temporal_expira_at = NULL WHERE correo_institucional <> ''schininin@uide.edu.ec''',
  'DO 0');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

-- Y se comprueba que quedó en NULL (si la columna no existe, no aplica).
SET @s := IF(@e = 1,
  'SELECT ''demo con expiracion de clave temporal (debe ser 0)'' AS chequeo, COUNT(*) AS valor FROM estudiante WHERE rol = ''estudiante'' AND password_temporal_expira_at IS NOT NULL',
  'SELECT ''columna password_temporal_expira_at: no existe en esta base'' AS chequeo, 0 AS valor');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;

SELECT 'PASOS 4-6 OK: base limpia y cuentas demo creadas' AS estado;

-- -----------------------------------------------------------------------------
-- PASO 7. Verificaciones finales (todo debe cuadrar)
-- -----------------------------------------------------------------------------
SELECT '--- VERIFICACIONES ---' AS reporte;

SELECT 'admins (debe ser 1: Steven)' AS chequeo, COUNT(*) AS valor
FROM estudiante WHERE rol = 'admin'
UNION ALL SELECT 'admin es schininin (debe ser 1)', COUNT(*)
FROM estudiante WHERE rol = 'admin' AND correo_institucional = 'schininin@uide.edu.ec'
UNION ALL SELECT 'cuentas demo creadas', COUNT(*)
FROM estudiante WHERE rol = 'estudiante'
UNION ALL SELECT 'cuentas demo esperadas', COUNT(*) FROM tmp_demo_autorizadas
UNION ALL SELECT 'correos fuera de la lista blanca (debe ser 0)', COUNT(*)
FROM estudiante e
WHERE e.correo_institucional <> 'schininin@uide.edu.ec'
  AND e.correo_institucional NOT IN (SELECT correo FROM tmp_demo_autorizadas)
UNION ALL SELECT 'correos de la lista que faltan (debe ser 0)', COUNT(*)
FROM tmp_demo_autorizadas a
WHERE a.correo NOT IN (SELECT correo_institucional FROM estudiante)
UNION ALL SELECT 'cuentas con rol candidato (debe ser 0)', COUNT(*)
FROM estudiante WHERE rol = 'candidato'
UNION ALL SELECT 'procesos (0)',      COUNT(*) FROM proceso_electoral
UNION ALL SELECT 'votaciones (0)',    COUNT(*) FROM votacion
UNION ALL SELECT 'listas (0)',        COUNT(*) FROM lista_candidata
UNION ALL SELECT 'candidatos (0)',    COUNT(*) FROM candidato
UNION ALL SELECT 'votos (0)',         COUNT(*) FROM voto
UNION ALL SELECT 'comprobantes (0)',  COUNT(*) FROM codigo_voto
UNION ALL SELECT 'asignaciones (0)',  COUNT(*) FROM asignacion_candidatura
UNION ALL SELECT 'actas (0)',         COUNT(*) FROM acta_resultados
UNION ALL SELECT 'veedurias (0)',     COUNT(*) FROM veeduria
UNION ALL SELECT 'cronogramas (0)',   COUNT(*) FROM cronograma
UNION ALL SELECT 'notificaciones (0)',COUNT(*) FROM notificacion
UNION ALL SELECT 'validaciones (0)',  COUNT(*) FROM validacion_requisito
UNION ALL SELECT 'planes de trabajo (0)', COUNT(*) FROM plan_trabajo
UNION ALL SELECT 'demo sin hash bcrypt (debe ser 0)', COUNT(*)
FROM estudiante WHERE rol = 'estudiante' AND password NOT LIKE '$2%'
UNION ALL SELECT 'demo con la misma contrasena compartida (= cuentas demo)', COUNT(*)
FROM estudiante WHERE rol = 'estudiante' AND password = @hash
UNION ALL SELECT 'demo que pediria cambio de clave (debe ser 0)', COUNT(*)
FROM estudiante WHERE rol = 'estudiante' AND debe_cambiar_password <> 0
UNION ALL SELECT 'cuenta stchinininca (debe ser 0)', COUNT(*)
FROM estudiante WHERE correo_institucional = 'stchinininca@uide.edu.ec'
UNION ALL SELECT 'demo inactivas (debe ser 0)', COUNT(*)
FROM estudiante WHERE rol = 'estudiante' AND estado_academico <> 'activo';

SELECT '--- CUENTAS DEMO CREADAS ---' AS reporte;
SELECT cedula, correo_institucional, CONCAT(nombres, ' ', apellidos) AS nombre,
       fk_id_carrera AS carrera, promedio, debe_cambiar_password
FROM estudiante
WHERE rol = 'estudiante'
ORDER BY correo_institucional;

DROP TABLE tmp_demo_autorizadas;

SELECT '--- CORREOS DE LA LISTA QUE NO SE CREAN ---' AS reporte;
SELECT 'caduarteen@uide.edu.ec' AS correo, 'pendiente' AS motivo,
       'No existe en la base: falta cedula, nombres y apellidos (fila comentada en el PASO 0)' AS detalle
UNION ALL
SELECT 'stchinininca@uide.edu.ec', 'excluido a proposito',
       'Steven participa solo como admin con schininin@uide.edu.ec';
