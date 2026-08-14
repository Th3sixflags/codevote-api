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
  -- Declara la misma collation que las columnas de cédula del esquema. En
  -- MySQL 8.4 el charset por defecto del servidor puede ser 0900_ai_ci,
  -- mientras que CodeVote usa utf8mb4_unicode_ci; sin esta definición los
  -- JOIN de actualización fallan con ER_CANT_AGGREGATE_NCOLLATIONS.
  vieja CHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY,
  nueva CHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE
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

-- Fuerza la misma regla de comparación en ambos lados del JOIN. Esto hace
-- que la migración sea reproducible tanto en bases creadas con
-- utf8mb4_unicode_ci como en instalaciones MySQL 8.4 cuyo default es
-- utf8mb4_0900_ai_ci.
UPDATE candidato       c JOIN mapa_cedula m ON CONVERT(m.vieja USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.fk_cedula_estudiante USING utf8mb4) COLLATE utf8mb4_unicode_ci  SET c.fk_cedula_estudiante  = m.nueva;
UPDATE codigo_voto    cv JOIN mapa_cedula m ON CONVERT(m.vieja USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(cv.fk_cedula_estudiante USING utf8mb4) COLLATE utf8mb4_unicode_ci SET cv.fk_cedula_estudiante = m.nueva;
UPDATE notificacion    n JOIN mapa_cedula m ON CONVERT(m.vieja USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(n.fk_cedula_estudiante USING utf8mb4) COLLATE utf8mb4_unicode_ci  SET n.fk_cedula_estudiante  = m.nueva;
UPDATE lista_candidata l JOIN mapa_cedula m ON CONVERT(m.vieja USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(l.fk_cedula_responsable USING utf8mb4) COLLATE utf8mb4_unicode_ci SET l.fk_cedula_responsable = m.nueva;
UPDATE estudiante      e JOIN mapa_cedula m ON CONVERT(m.vieja USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(e.cedula USING utf8mb4) COLLATE utf8mb4_unicode_ci                SET e.cedula                = m.nueva;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;

-- Verificación: no deben quedar referencias huérfanas (todo debe dar 0).
SELECT CONVERT('candidato huérfanos' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS chequeo, COUNT(*) AS filas FROM candidato       c LEFT JOIN estudiante e ON CONVERT(e.cedula USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.fk_cedula_estudiante USING utf8mb4) COLLATE utf8mb4_unicode_ci  WHERE e.cedula IS NULL
UNION ALL SELECT CONVERT('codigo_voto huérfanos' USING utf8mb4) COLLATE utf8mb4_unicode_ci, COUNT(*) FROM codigo_voto            cv LEFT JOIN estudiante e ON CONVERT(e.cedula USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(cv.fk_cedula_estudiante USING utf8mb4) COLLATE utf8mb4_unicode_ci WHERE e.cedula IS NULL
UNION ALL SELECT CONVERT('notificacion huérfanas' USING utf8mb4) COLLATE utf8mb4_unicode_ci, COUNT(*) FROM notificacion            n LEFT JOIN estudiante e ON CONVERT(e.cedula USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(n.fk_cedula_estudiante USING utf8mb4) COLLATE utf8mb4_unicode_ci  WHERE e.cedula IS NULL
UNION ALL SELECT CONVERT('listas sin responsable' USING utf8mb4) COLLATE utf8mb4_unicode_ci, COUNT(*) FROM lista_candidata         l LEFT JOIN estudiante e ON CONVERT(e.cedula USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(l.fk_cedula_responsable USING utf8mb4) COLLATE utf8mb4_unicode_ci WHERE l.fk_cedula_responsable IS NOT NULL AND e.cedula IS NULL;
