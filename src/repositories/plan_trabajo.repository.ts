import { pool } from '../config/database.js';
import { CrearPlanTrabajoDTO, ActualizarPlanTrabajoDTO } from '../schemas/plan_trabajo.schema.js';

const BASE_QUERY = `
  SELECT
    p.id_plan, p.area, p.propuesta, p.archivo_url,
    p.fk_id_lista, l.nombre_lista
  FROM plan_trabajo p
  JOIN lista_candidata l ON l.id_lista = p.fk_id_lista
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY p.id_plan');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE p.id_plan = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByLista(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE p.fk_id_lista = ?', [id]);
  return rows as any[];
}

export async function create(data: CrearPlanTrabajoDTO) {
  const [result] = await pool.query(
    `INSERT INTO plan_trabajo (area, propuesta, archivo_url, fk_id_lista)
     VALUES (?, ?, ?, ?)`,
    [data.area, data.propuesta, data.archivo_url ?? null, data.fk_id_lista]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarPlanTrabajoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE plan_trabajo SET ${sets} WHERE id_plan = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM plan_trabajo WHERE id_plan = ?', [id]);
}
