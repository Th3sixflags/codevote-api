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
