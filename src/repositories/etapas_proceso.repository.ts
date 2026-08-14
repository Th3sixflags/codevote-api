import { pool } from '../config/database.js';

/**
 * Avanza los procesos electorales de la fase 'planificado' a 'convocado'
 * si ya llegó su fecha de convocatoria.
 * Retorna el número de procesos actualizados.
 */
export async function avanzarAConvocado(hoyEnEcuador: string): Promise<number> {
  const [resultado] = await pool.query(
    `UPDATE proceso_electoral
        SET estado = 'convocado'
      WHERE estado = 'planificado'
        AND fecha_convocatoria <= ?
        AND archivado_at IS NULL`,
    [hoyEnEcuador]
  ) as [any, any];
  return resultado.affectedRows;
}

/**
 * Avanza los procesos electorales a 'inscripcion' si ya llegó su hora
 * de inicio de inscripción y aún no ha terminado.
 * Retorna el número de procesos actualizados.
 */
export async function avanzarAInscripcion(ahoraEnEcuador: string): Promise<number> {
  const [resultado] = await pool.query(
    `UPDATE proceso_electoral
        SET estado = 'inscripcion'
      WHERE estado IN ('planificado', 'convocado')
        AND fecha_inicio_inscripcion IS NOT NULL
        AND fecha_inicio_inscripcion <= ?
        AND (fecha_fin_inscripcion IS NULL OR fecha_fin_inscripcion > ?)
        AND archivado_at IS NULL`,
    [ahoraEnEcuador, ahoraEnEcuador]
  ) as [any, any];
  return resultado.affectedRows;
}

/**
 * Avanza los procesos electorales a 'campaña' si ya terminó la hora
 * de inscripción. (El paso a 'votacion' se encargará de pisar 'campaña' 
 * si la elección ya empezó).
 * Retorna el número de procesos actualizados.
 */
export async function avanzarACampana(ahoraEnEcuador: string): Promise<number> {
  const [resultado] = await pool.query(
    `UPDATE proceso_electoral
        SET estado = 'campaña'
      WHERE estado IN ('planificado', 'convocado', 'inscripcion')
        AND fecha_fin_inscripcion IS NOT NULL
        AND fecha_fin_inscripcion <= ?
        AND archivado_at IS NULL`,
    [ahoraEnEcuador]
  ) as [any, any];
  return resultado.affectedRows;
}
