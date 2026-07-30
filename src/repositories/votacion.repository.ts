import { pool } from '../config/database.js';
import { calcularBloqueo, bandera } from '../utils/bloqueoEliminacion.js';
import { CrearVotacionDTO, ActualizarVotacionDTO } from '../schemas/votacion.schema.js';

// Se calcula la actividad electoral de la votación para que el frontend sepa si
// puede eliminarla o si es evidencia que solo se conserva.
/**
 * Filtro por carrera de la papeleta:
 *  - undefined -> sin filtro (administración).
 *  - null      -> solo papeletas globales.
 *  - number    -> globales + la de esa carrera.
 */
export type FiltroCarrera = number | null | undefined;

function condicionCarrera(filtro: FiltroCarrera): { sql: string; params: any[] } {
  if (filtro === undefined) return { sql: '', params: [] };
  if (filtro === null) return { sql: ' AND v.fk_id_carrera IS NULL', params: [] };
  return { sql: ' AND (v.fk_id_carrera IS NULL OR v.fk_id_carrera = ?)', params: [filtro] };
}

const BASE_QUERY = `
  SELECT
    v.id_votacion, v.titulo_papeleta, v.fecha_apertura, v.fecha_cierre, v.estado, v.foto_url,
    v.fk_id_carrera, c.nombre_carrera,
    p.id_proceso, p.nombre_proceso,
    EXISTS(SELECT 1 FROM voto x WHERE x.fk_id_votacion = v.id_votacion) AS tiene_votos,
    EXISTS(SELECT 1 FROM codigo_voto cv WHERE cv.fk_id_votacion = v.id_votacion) AS tiene_comprobantes,
    EXISTS(SELECT 1 FROM acta_resultados a WHERE a.fk_id_votacion = v.id_votacion) AS tiene_actas,
    EXISTS(SELECT 1 FROM veeduria ve WHERE ve.fk_id_votacion = v.id_votacion) AS tiene_veedurias
  FROM votacion v
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
  LEFT JOIN carrera c ON c.id_carrera = v.fk_id_carrera
`;

/** Añade puede_eliminar / motivo_bloqueo y quita las banderas crudas. */
function conBloqueo(row: any) {
  if (!row) return row;
  const { tiene_votos, tiene_comprobantes, tiene_actas, tiene_veedurias, ...votacion } = row;
  return {
    ...votacion,
    ...calcularBloqueo({
      votos:        bandera(tiene_votos),
      comprobantes: bandera(tiene_comprobantes),
      actas:        bandera(tiene_actas),
      veedurias:    bandera(tiene_veedurias),
    }),
  };
}

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY v.fecha_apertura DESC');
  return (rows as any[]).map(conBloqueo);
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.id_votacion = ?', [id]) as [any[], any];
  return conBloqueo(rows[0] ?? null);
}

/**
 * Votaciones (papeletas) de un proceso, filtradas por carrera:
 *  - undefined -> todas (administración).
 *  - null      -> solo las papeletas globales.
 *  - number    -> las globales + la de esa carrera.
 */
export async function findByProceso(procesoId: number, filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE v.fk_id_proceso = ?${sql} ORDER BY v.fecha_apertura`,
    [procesoId, ...params]
  );
  return (rows as any[]).map(conBloqueo);
}

/** ¿Ya existe una papeleta de esa carrera en el proceso? (excluye una opcional) */
export async function existeCarreraEnProceso(procesoId: number, carreraId: number, exceptId = 0): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM votacion WHERE fk_id_proceso = ? AND fk_id_carrera = ? AND id_votacion <> ? LIMIT 1',
    [procesoId, carreraId, exceptId]
  ) as [any[], any];
  return rows.length > 0;
}

export async function create(data: CrearVotacionDTO) {
  const [result] = await pool.query(
    `INSERT INTO votacion (fk_id_proceso, titulo_papeleta, fecha_apertura, fecha_cierre, estado, fk_id_carrera, foto_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.fk_id_proceso, data.titulo_papeleta, data.fecha_apertura, data.fecha_cierre, data.estado ?? 'pendiente', data.fk_id_carrera ?? null, data.foto_url ?? null]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarVotacionDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE votacion SET ${sets} WHERE id_votacion = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM votacion WHERE id_votacion = ?', [id]);
}
