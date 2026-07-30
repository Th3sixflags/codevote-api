import { pool } from '../config/database.js';
import { calcularBloqueo, bandera } from '../utils/bloqueoEliminacion.js';
import { CrearProcesoDTO, ActualizarProcesoDTO } from '../schemas/proceso_electoral.schema.js';

// Además de los datos del proceso se calcula si tiene actividad electoral, para
// que el frontend sepa de antemano si puede eliminarlo o solo cancelar/archivar.
const BASE_QUERY = `
  SELECT p.*, c.nombre_carrera,
    EXISTS(SELECT 1 FROM votacion vo JOIN voto v ON v.fk_id_votacion = vo.id_votacion
           WHERE vo.fk_id_proceso = p.id_proceso) AS tiene_votos,
    EXISTS(SELECT 1 FROM votacion vo JOIN codigo_voto cv ON cv.fk_id_votacion = vo.id_votacion
           WHERE vo.fk_id_proceso = p.id_proceso) AS tiene_comprobantes,
    EXISTS(SELECT 1 FROM votacion vo JOIN acta_resultados a ON a.fk_id_votacion = vo.id_votacion
           WHERE vo.fk_id_proceso = p.id_proceso) AS tiene_actas,
    EXISTS(SELECT 1 FROM votacion vo JOIN veeduria ve ON ve.fk_id_votacion = vo.id_votacion
           WHERE vo.fk_id_proceso = p.id_proceso) AS tiene_veedurias
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

/**
 * Reemplaza las banderas crudas de actividad electoral por los campos que
 * consume el frontend: puede_eliminar y motivo_bloqueo.
 */
function conBloqueo(row: any) {
  if (!row) return row;
  const { tiene_votos, tiene_comprobantes, tiene_actas, tiene_veedurias, ...proceso } = row;
  return {
    ...proceso,
    ...calcularBloqueo({
      votos:        bandera(tiene_votos),
      comprobantes: bandera(tiene_comprobantes),
      actas:        bandera(tiene_actas),
      veedurias:    bandera(tiene_veedurias),
    }),
  };
}

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
  return (rows as any[]).map(conBloqueo);
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
  return (rows as any[]).map(conBloqueo);
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
  return (rows as any[]).map(conBloqueo);
}

/** Procesos archivados (conservados solo para historial y auditoría). */
export async function findArchivados(filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE p.archivado_at IS NOT NULL${sql} ORDER BY p.archivado_at DESC`,
    params
  );
  return (rows as any[]).map(conBloqueo);
}

/** Marca el proceso como cancelado (sin borrar nada). */
export async function cancelar(id: number) {
  await pool.query("UPDATE proceso_electoral SET estado = 'cancelado' WHERE id_proceso = ?", [id]);
  return findById(id);
}

/** Marca el proceso como archivado (sin borrar nada). */
export async function archivar(id: number) {
  await pool.query('UPDATE proceso_electoral SET archivado_at = NOW() WHERE id_proceso = ?', [id]);
  return findById(id);
}

export async function findById(id: number) {
  const [rows] = await pool.query(`${BASE_QUERY} WHERE p.id_proceso = ?`, [id]) as [any[], any];
  return conBloqueo(rows[0] ?? null);
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
