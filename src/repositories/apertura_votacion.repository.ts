import { pool } from '../config/database.js';

/**
 * Apertura automática de papeletas.
 *
 * La otra mitad del ciclo de vida que faltaba. Hasta ahora una papeleta se
 * creaba en 'pendiente' y NINGÚN camino del código la pasaba a 'abierta': el
 * único UPDATE sobre `votacion.estado` era el del cierre, condicionado a que ya
 * estuviera abierta. Con lo cual una votación programada para las 18:00 no
 * abría a las 18:00, y al no abrir tampoco entraba en el cierre automático (que
 * busca `estado = 'abierta'`), no emitía acta y su proceso no podía finalizar.
 *
 * Este repositorio sincroniza la columna con lo que la fecha ya dice. La regla
 * de negocio vive en utils/estadoVotacion.ts y aquí solo se refleja, de modo que
 * lo que la API responde y lo que la base guarda no puedan contradecirse.
 *
 * El corte llega como parámetro —la hora de Ecuador calculada en Node— en vez de
 * usar `NOW()`, igual que en el cierre: así la comparación no depende de la zona
 * horaria de la sesión de MySQL ni de la del contenedor.
 */

/** Papeleta que ya debería estar abierta, con el contexto de su proceso. */
export interface PapeletaPorAbrir {
  id_votacion: number;
  titulo_papeleta: string;
  fk_id_carrera: number | null;
  nombre_carrera: string | null;
  id_proceso: number;
  nombre_proceso: string;
  estado_proceso: string;
  fecha_apertura: string;
  fecha_cierre: string;
}

/**
 * Papeletas pendientes cuya hora de apertura ya pasó y que TODAVÍA están en
 * plazo.
 *
 * Se exige que no hayan vencido —ni por su propio `fecha_cierre` ni por el
 * `fecha_fin_votacion` del proceso— para no abrir una papeleta que habría que
 * cerrar en la misma pasada: una votación que nació caducada (porque el
 * servidor estuvo apagado toda su ventana) nunca llegó a estar abierta, y
 * fingir lo contrario falsearía el historial. El cierre la recoge y le emite su
 * acta con cero votos, que es lo que de verdad ocurrió.
 *
 * Un proceso cancelado o archivado no abre nada: son estados finales decididos
 * por la administración y este automatismo no debe pisarlos.
 */
export async function papeletasPorAbrir(corteEnEcuador: string): Promise<PapeletaPorAbrir[]> {
  const [rows] = await pool.query(
    `SELECT v.id_votacion, v.titulo_papeleta, v.fk_id_carrera,
            c.nombre_carrera,
            p.id_proceso, p.nombre_proceso, p.estado AS estado_proceso,
            v.fecha_apertura, v.fecha_cierre
       FROM votacion v
       JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
       LEFT JOIN carrera c ON c.id_carrera = v.fk_id_carrera
      WHERE v.estado = 'pendiente'
        AND v.fecha_apertura IS NOT NULL
        AND v.fecha_apertura <= ?
        AND (v.fecha_cierre IS NULL OR v.fecha_cierre > ?)
        AND (p.fecha_fin_votacion IS NULL OR p.fecha_fin_votacion > ?)
        AND p.estado NOT IN ('cancelado', 'finalizado')
        AND p.archivado_at IS NULL
      ORDER BY v.fecha_apertura, v.id_votacion`,
    [corteEnEcuador, corteEnEcuador, corteEnEcuador]
  ) as [any[], any];
  return rows as PapeletaPorAbrir[];
}

/**
 * Abre la papeleta y dice si la abrió ESTA llamada.
 *
 * El `AND estado = 'pendiente'` es la garantía de idempotencia, igual que el
 * `AND estado = 'abierta'` del cierre: si otra ejecución llegó antes, o si la
 * administración ya la había abierto a mano, `affectedRows` vale 0 y quien
 * llama sabe que no debe volver a notificar.
 */
export async function abrirSiSiguePendiente(votacionId: number): Promise<boolean> {
  const [resultado] = await pool.query(
    `UPDATE votacion SET estado = 'abierta' WHERE id_votacion = ? AND estado = 'pendiente'`,
    [votacionId]
  ) as [any, any];
  return resultado.affectedRows > 0;
}

/**
 * Pone el proceso en 'votacion' cuando su jornada ya empezó.
 *
 * Sin esto el proceso se quedaba en 'planificado' (o en la etapa que hubiera
 * dejado la administración) mientras la gente ya estaba votando, y el panel
 * mostraba una etiqueta que no correspondía con la realidad.
 *
 * Solo avanza desde las etapas PREVIAS a la votación. No toca 'escrutinio',
 * 'finalizado', 'cancelado' ni un proceso archivado: son posteriores o finales,
 * y hacer retroceder un proceso sería peor que no tocarlo.
 */
/**
 * Procesos cuya jornada de votación ya empezó y que siguen etiquetados en una
 * etapa previa. Son los que quedaron a medias: sus papeletas ya estaban
 * abiertas (a mano, o de una pasada anterior) y solo falta la etiqueta.
 */
export async function procesosEnJornadaSinMarcar(corteEnEcuador: string): Promise<number[]> {
  const [rows] = await pool.query(
    `SELECT p.id_proceso
       FROM proceso_electoral p
      WHERE p.estado IN ('planificado', 'convocado', 'inscripcion', 'campaña')
        AND p.archivado_at IS NULL
        AND p.fecha_inicio_votacion IS NOT NULL
        AND p.fecha_inicio_votacion <= ?
        AND (p.fecha_fin_votacion IS NULL OR p.fecha_fin_votacion > ?)
        AND EXISTS (SELECT 1 FROM votacion v WHERE v.fk_id_proceso = p.id_proceso)`,
    [corteEnEcuador, corteEnEcuador]
  ) as [any[], any];
  return rows.map((r) => Number(r.id_proceso));
}

export async function marcarProcesoEnVotacion(
  procesoId: number, corteEnEcuador: string
): Promise<boolean> {
  const [resultado] = await pool.query(
    `UPDATE proceso_electoral
        SET estado = 'votacion'
      WHERE id_proceso = ?
        AND estado IN ('planificado', 'convocado', 'inscripcion', 'campaña')
        AND archivado_at IS NULL
        AND fecha_inicio_votacion IS NOT NULL
        AND fecha_inicio_votacion <= ?
        AND (fecha_fin_votacion IS NULL OR fecha_fin_votacion > ?)`,
    [procesoId, corteEnEcuador, corteEnEcuador]
  ) as [any, any];
  return resultado.affectedRows > 0;
}
