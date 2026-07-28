import { pool } from '../config/database.js';

const COLUMNAS = 'id_notificacion, fk_cedula_estudiante, tipo, titulo, mensaje, leida, fecha_creacion';

/** Notificaciones de un estudiante, de la más reciente a la más antigua. */
export async function findByEstudiante(cedula: string) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNAS} FROM notificacion
     WHERE fk_cedula_estudiante = ?
     ORDER BY fecha_creacion DESC, id_notificacion DESC`,
    [cedula]
  );
  return rows as any[];
}

/** Una notificación, solo si pertenece al estudiante indicado. */
export async function findByIdYEstudiante(id: number, cedula: string) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNAS} FROM notificacion WHERE id_notificacion = ? AND fk_cedula_estudiante = ?`,
    [id, cedula]
  ) as [any[], any];
  return rows[0] ?? null;
}

/** Marca como leída solo si la notificación es del estudiante. Devuelve si hubo cambio. */
export async function marcarLeida(id: number, cedula: string): Promise<boolean> {
  const [result] = await pool.query(
    'UPDATE notificacion SET leida = 1 WHERE id_notificacion = ? AND fk_cedula_estudiante = ?',
    [id, cedula]
  ) as [any, any];
  return result.affectedRows > 0;
}

export async function crear(cedula: string, tipo: string, titulo: string, mensaje: string) {
  await pool.query(
    'INSERT INTO notificacion (fk_cedula_estudiante, tipo, titulo, mensaje) VALUES (?, ?, ?, ?)',
    [cedula, tipo, titulo, mensaje]
  );
}

/** Crea la misma notificación para cada estudiante que votó en un proceso. */
export async function crearParaVotantesDeProceso(procesoId: number, tipo: string, titulo: string, mensaje: string) {
  await pool.query(
    `INSERT INTO notificacion (fk_cedula_estudiante, tipo, titulo, mensaje)
     SELECT DISTINCT cv.fk_cedula_estudiante, ?, ?, ?
     FROM codigo_voto cv
     JOIN votacion v ON v.id_votacion = cv.fk_id_votacion
     WHERE v.fk_id_proceso = ?`,
    [tipo, titulo, mensaje, procesoId]
  );
}
