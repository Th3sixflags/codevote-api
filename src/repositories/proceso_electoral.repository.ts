import { pool } from '../config/database.js';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema.js';

/** Listado general: excluye los archivados (que solo se ven en el historial). */
export async function findAll() {
  const [rows] = await pool.query(
    'SELECT * FROM proceso_electoral WHERE archivado_at IS NULL ORDER BY fecha_inicio_votacion DESC'
  );
  return rows as any[];
}

/** Procesos activos o próximos (todo lo que no está finalizado, cancelado ni archivado). */
export async function findActuales() {
  const [rows] = await pool.query(
    `SELECT * FROM proceso_electoral
     WHERE estado NOT IN ('finalizado', 'cancelado') AND archivado_at IS NULL
     ORDER BY fecha_inicio_votacion ASC`
  );
  return rows as any[];
}

/** Procesos finalizados NO archivados, del más reciente al más antiguo (historial). */
export async function findFinalizados() {
  const [rows] = await pool.query(
    `SELECT * FROM proceso_electoral
     WHERE estado = 'finalizado' AND archivado_at IS NULL
     ORDER BY fecha_fin_votacion DESC`
  );
  return rows as any[];
}

/** Procesos archivados (conservados solo para historial y auditoría). */
export async function findArchivados() {
  const [rows] = await pool.query(
    `SELECT * FROM proceso_electoral
     WHERE archivado_at IS NOT NULL
     ORDER BY archivado_at DESC`
  );
  return rows as any[];
}

/** Marca el proceso como archivado (sin borrar nada). */
export async function archivar(id: number) {
  await pool.query('UPDATE proceso_electoral SET archivado_at = NOW() WHERE id_proceso = ?', [id]);
  return findById(id);
}

export async function findById(id: number) {
  const [rows] = await pool.query('SELECT * FROM proceso_electoral WHERE id_proceso = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearProcesoDTO) {
  const [result] = await pool.query(
    `INSERT INTO proceso_electoral (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion, fecha_fin_votacion, estado, descripcion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.nombre_proceso, data.tipo_proceso, data.fecha_convocatoria, data.fecha_inicio_votacion, data.fecha_fin_votacion, data.estado ?? 'planificado', data.descripcion ?? null]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarProcesoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE proceso_electoral SET ${sets} WHERE id_proceso = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM proceso_electoral WHERE id_proceso = ?', [id]);
}
