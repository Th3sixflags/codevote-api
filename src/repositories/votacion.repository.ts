import { pool } from '../config/database.js';
import { CrearVotacionDTO, ActualizarVotacionDTO } from '../schemas/votacion.schema.js';

const BASE_QUERY = `
  SELECT
    v.id_votacion, v.titulo_papeleta, v.fecha_apertura, v.fecha_cierre, v.estado,
    p.id_proceso, p.nombre_proceso
  FROM votacion v
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY v.fecha_apertura DESC');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.id_votacion = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByProceso(procesoId: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.fk_id_proceso = ? ORDER BY v.fecha_apertura', [procesoId]);
  return rows as any[];
}

export async function create(data: CrearVotacionDTO) {
  const [result] = await pool.query(
    `INSERT INTO votacion (fk_id_proceso, titulo_papeleta, fecha_apertura, fecha_cierre, estado)
     VALUES (?, ?, ?, ?, ?)`,
    [data.fk_id_proceso, data.titulo_papeleta, data.fecha_apertura, data.fecha_cierre, data.estado ?? 'pendiente']
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
