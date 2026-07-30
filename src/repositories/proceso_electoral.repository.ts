import { pool } from '../config/database.js';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema.js';

const BASE_QUERY = `
  SELECT p.*, c.nombre_carrera
  FROM proceso_electoral p
  LEFT JOIN carrera c ON c.id_carrera = p.fk_id_carrera
`;

/**
 * Filtro de visibilidad por carrera:
 *  - undefined -> sin filtro (administración: ve todo).
 *  - null      -> estudiante sin carrera asignada: solo procesos globales.
 *  - number    -> estudiante: procesos globales + los de su carrera.
 */
export type FiltroCarrera = number | null | undefined;

function condicionCarrera(filtro: FiltroCarrera): { sql: string; params: any[] } {
  if (filtro === undefined) return { sql: '', params: [] };
  if (filtro === null) return { sql: ' AND p.fk_id_carrera IS NULL', params: [] };
  return { sql: ' AND (p.fk_id_carrera IS NULL OR p.fk_id_carrera = ?)', params: [filtro] };
}

/** Listado general: excluye los archivados (que solo se ven en el historial). */
export async function findAll(filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE p.archivado_at IS NULL${sql} ORDER BY p.fecha_inicio_votacion DESC`,
    params
  );
  return rows as any[];
}

/** Procesos activos o próximos (todo lo que no está finalizado, cancelado ni archivado). */
export async function findActuales(filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY}
     WHERE p.estado NOT IN ('finalizado', 'cancelado') AND p.archivado_at IS NULL${sql}
     ORDER BY p.fecha_inicio_votacion ASC`,
    params
  );
  return rows as any[];
}

/** Procesos finalizados NO archivados, del más reciente al más antiguo (historial). */
export async function findFinalizados(filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY}
     WHERE p.estado = 'finalizado' AND p.archivado_at IS NULL${sql}
     ORDER BY p.fecha_fin_votacion DESC`,
    params
  );
  return rows as any[];
}

/** Procesos archivados (conservados solo para historial y auditoría). */
export async function findArchivados(filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE p.archivado_at IS NOT NULL${sql} ORDER BY p.archivado_at DESC`,
    params
  );
  return rows as any[];
}

/** Marca el proceso como archivado (sin borrar nada). */
export async function archivar(id: number) {
  await pool.query('UPDATE proceso_electoral SET archivado_at = NOW() WHERE id_proceso = ?', [id]);
  return findById(id);
}

export async function findById(id: number) {
  const [rows] = await pool.query(`${BASE_QUERY} WHERE p.id_proceso = ?`, [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearProcesoDTO) {
  const [result] = await pool.query(
    `INSERT INTO proceso_electoral
       (nombre_proceso, tipo_proceso, fecha_convocatoria, fecha_inicio_votacion, fecha_fin_votacion,
        estado, descripcion, fk_id_carrera, fecha_inicio_inscripcion, fecha_fin_inscripcion, fecha_posesion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.nombre_proceso, data.tipo_proceso, data.fecha_convocatoria,
      data.fecha_inicio_votacion, data.fecha_fin_votacion,
      data.estado ?? 'planificado', data.descripcion ?? null,
      data.fk_id_carrera ?? null,
      data.fecha_inicio_inscripcion ?? null,
      data.fecha_fin_inscripcion ?? null,
      data.fecha_posesion ?? null,
    ]
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
