import { pool } from '../config/database.js';

const COLUMNAS = 'id_notificacion, fk_cedula_estudiante, tipo, titulo, mensaje, leida, fecha_creacion';

/** Notificaciones de un estudiante, de la más reciente a la más antigua. */
export async function findByEstudiante(cedula: string) {
  const [rows] = await pool.query(
    `SELECT n.id_notificacion, n.fk_cedula_estudiante, n.tipo, n.titulo, n.mensaje, n.leida, n.fecha_creacion
     FROM notificacion n
     JOIN estudiante e ON e.cedula = n.fk_cedula_estudiante
     WHERE n.fk_cedula_estudiante = ?
     ORDER BY n.fecha_creacion DESC, n.id_notificacion DESC`,
    [cedula]
  );
  return rows as any[];
}

/** Una notificación, solo si pertenece al estudiante indicado. */
export async function findByIdYEstudiante(id: number, cedula: string) {
  const [rows] = await pool.query(
    `SELECT n.id_notificacion, n.fk_cedula_estudiante, n.tipo, n.titulo, n.mensaje, n.leida, n.fecha_creacion
     FROM notificacion n
     JOIN estudiante e ON e.cedula = n.fk_cedula_estudiante
     WHERE n.id_notificacion = ? AND n.fk_cedula_estudiante = ?`,
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

/** Elimina avisos ya vistos que superaron la ventana de retención. */
export async function eliminarLeidasAntiguas(dias = 7): Promise<number> {
  const diasSeguros = Math.max(1, Math.min(365, Math.floor(Number(dias) || 7)));
  const [result] = await pool.query(
    `DELETE FROM notificacion
      WHERE leida = 1
        AND fecha_creacion < DATE_SUB(NOW(), INTERVAL ${diasSeguros} DAY)`
  ) as [any, any];
  return Number(result.affectedRows ?? 0);
}
