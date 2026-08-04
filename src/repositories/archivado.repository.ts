import { pool } from '../config/database.js';
import type { PoolConnection } from 'mysql2/promise';

/**
 * Archivado de un proceso y liberación de sus candidaturas.
 *
 * Archivar NO borra nada: procesos, papeletas, listas, integrantes, propuestas,
 * votos, comprobantes y actas quedan como historial. Lo único que cambia es que
 * el proceso deja de estar activo, y con él sus candidaturas: quien era
 * responsable recupera su rol de estudiante y puede volver a postularse en un
 * proceso futuro.
 *
 * Todas estas funciones aceptan una conexión para poder ejecutarse dentro de la
 * misma transacción que el archivado o el borrado.
 */

type Ejecutor = Pick<PoolConnection, 'query'>;

/** Cédulas de quienes son responsables de alguna lista del proceso. */
export async function responsablesDelProceso(procesoId: number, cx: Ejecutor = pool): Promise<string[]> {
  const [rows] = await cx.query(
    `SELECT DISTINCT fk_cedula_responsable AS cedula
       FROM lista_candidata
      WHERE fk_id_proceso = ? AND fk_cedula_responsable IS NOT NULL`,
    [procesoId]
  ) as [any[], any];
  return rows.map((r) => String(r.cedula));
}

/**
 * Retira las asignaciones de candidatura ligadas a las papeletas del proceso.
 *
 * Se marcan como 'retirada' en vez de borrarse: la fila queda como constancia y,
 * al no estar activa, deja de bloquear una futura postulación.
 */
export async function retirarAsignacionesDelProceso(procesoId: number, cx: Ejecutor = pool): Promise<number> {
  const [resultado] = await cx.query(
    `UPDATE asignacion_candidatura a
       JOIN votacion v ON v.id_votacion = a.fk_id_votacion
        SET a.estado = 'retirada'
      WHERE v.fk_id_proceso = ? AND a.estado = 'activa'`,
    [procesoId]
  ) as [any, any];
  return resultado.affectedRows ?? 0;
}

/**
 * Devuelve a 'estudiante' a quienes ya no dirigen ninguna candidatura vigente.
 *
 * Una candidatura cuenta como vigente si su proceso NO está archivado, o si la
 * persona conserva una asignación activa EN UN PROCESO NO ARCHIVADO. Así, quien
 * presidía dos listas a la vez conserva el rol al archivarse solo una de ellas,
 * y en cambio una fila 'activa' que quedó apuntando a un proceso ya archivado
 * no retiene el rol: eso es justo lo que dejó a un candidato atrapado en
 * producción.
 *
 * El corte es `archivado_at IS NOT NULL`, no `estado = 'archivado'`: un proceso
 * archivado conserva su estado anterior (finalizado o cancelado).
 *
 * Los admin nunca se tocan.
 */
export async function degradarResponsablesLiberados(cedulas: string[], cx: Ejecutor = pool): Promise<string[]> {
  if (cedulas.length === 0) return [];

  const marcadores = cedulas.map(() => '?').join(', ');
  const [resultado] = await cx.query(
    `UPDATE estudiante e
        SET e.rol = 'estudiante'
      WHERE e.cedula IN (${marcadores})
        AND e.rol = 'candidato'
        AND NOT EXISTS (
          SELECT 1 FROM lista_candidata l
            JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
           WHERE l.fk_cedula_responsable = e.cedula
             AND p.archivado_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM asignacion_candidatura a
            JOIN votacion v2 ON v2.id_votacion = a.fk_id_votacion
            JOIN proceso_electoral p2 ON p2.id_proceso = v2.fk_id_proceso
           WHERE a.fk_cedula_estudiante = e.cedula
             AND a.estado = 'activa'
             AND p2.archivado_at IS NULL
        )`,
    cedulas
  ) as [any, any];

  // Se devuelven las cédulas realmente degradadas para poder informar y probar.
  if ((resultado.affectedRows ?? 0) === 0) return [];
  const [rows] = await cx.query(
    `SELECT cedula FROM estudiante WHERE cedula IN (${marcadores}) AND rol = 'estudiante'`,
    cedulas
  ) as [any[], any];
  return rows.map((r) => String(r.cedula));
}

/**
 * Archiva el proceso y libera sus candidaturas, todo en una transacción.
 *
 * IDEMPOTENTE: el sello de archivado solo se pone si aún no lo tenía, y tanto
 * el retiro de asignaciones como la degradación de roles están condicionados,
 * así que repetir la operación no cambia nada ni falla.
 */
export async function archivarYLiberar(procesoId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [sello] = await conn.query(
      'UPDATE proceso_electoral SET archivado_at = NOW() WHERE id_proceso = ? AND archivado_at IS NULL',
      [procesoId]
    ) as [any, any];

    const responsables = await responsablesDelProceso(procesoId, conn);
    const asignacionesRetiradas = await retirarAsignacionesDelProceso(procesoId, conn);
    const liberados = await degradarResponsablesLiberados(responsables, conn);

    await conn.commit();
    return {
      yaEstabaArchivado: (sello.affectedRows ?? 0) === 0,
      asignacionesRetiradas,
      responsablesLiberados: liberados,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Repara los procesos archivados que quedaron a medias.
 *
 * Antes de que archivar liberase la candidatura, un proceso podía archivarse
 * dejando asignaciones en 'activa' y responsables con rol 'candidato'. Esta
 * función recorre todos los procesos archivados y les aplica el mismo cierre,
 * de modo que el estado converja sin tocar listas, votos, comprobantes ni actas.
 *
 * IDEMPOTENTE: se apoya en las mismas sentencias condicionadas, así que
 * ejecutarla dos veces no cambia nada la segunda vez.
 */
export async function reconciliarArchivados() {
  const [procesos] = await pool.query(
    `SELECT DISTINCT p.id_proceso, p.nombre_proceso
       FROM proceso_electoral p
      WHERE p.archivado_at IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM asignacion_candidatura a
              JOIN votacion v ON v.id_votacion = a.fk_id_votacion
             WHERE v.fk_id_proceso = p.id_proceso AND a.estado = 'activa'
          )
          OR EXISTS (
            -- Un responsable con rol candidato solo cuenta si NO tiene otra
            -- candidatura vigente: si volvió a postularse en un proceso nuevo,
            -- su rol es correcto y este proceso no necesita reparación. Sin
            -- este matiz, un proceso archivado se marcaría como pendiente en
            -- cada arranque aunque no hubiera nada que cambiar.
            SELECT 1 FROM lista_candidata l
              JOIN estudiante e ON e.cedula = l.fk_cedula_responsable
             WHERE l.fk_id_proceso = p.id_proceso
               AND e.rol = 'candidato'
               AND NOT EXISTS (
                 SELECT 1 FROM lista_candidata l2
                   JOIN proceso_electoral p2 ON p2.id_proceso = l2.fk_id_proceso
                  WHERE l2.fk_cedula_responsable = e.cedula AND p2.archivado_at IS NULL
               )
               AND NOT EXISTS (
                 SELECT 1 FROM asignacion_candidatura a2
                   JOIN votacion v2 ON v2.id_votacion = a2.fk_id_votacion
                   JOIN proceso_electoral p3 ON p3.id_proceso = v2.fk_id_proceso
                  WHERE a2.fk_cedula_estudiante = e.cedula
                    AND a2.estado = 'activa'
                    AND p3.archivado_at IS NULL
               )
          )
        )`
  ) as [any[], any];

  const reparados: Array<{ id_proceso: number; nombre_proceso: string; asignacionesRetiradas: number; responsablesLiberados: string[] }> = [];

  for (const proceso of procesos) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const responsables = await responsablesDelProceso(proceso.id_proceso, conn);
      const asignacionesRetiradas = await retirarAsignacionesDelProceso(proceso.id_proceso, conn);
      const responsablesLiberados = await degradarResponsablesLiberados(responsables, conn);
      await conn.commit();
      // Solo se informa si algo cambió de verdad, para que el log no repita
      // procesos que ya estaban bien.
      if (asignacionesRetiradas > 0 || responsablesLiberados.length > 0) {
        reparados.push({
          id_proceso: proceso.id_proceso,
          nombre_proceso: proceso.nombre_proceso,
          asignacionesRetiradas,
          responsablesLiberados,
        });
      }
    } catch (err) {
      await conn.rollback();
      console.error(`[archivado] no se pudo reconciliar el proceso ${proceso.id_proceso}`, err);
    } finally {
      conn.release();
    }
  }

  return reparados;
}
