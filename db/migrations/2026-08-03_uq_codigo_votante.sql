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
