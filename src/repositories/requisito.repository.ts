import { pool } from '../config/database';
import { CrearRequisitoDTO, ActualizarRequisitoDTO } from '../schemas/requisito.schema';

const BASE_QUERY = `
  SELECT * FROM requisito
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY id_requisito');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE id_requisito = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearRequisitoDTO) {
  const [result] = await pool.query(
    `INSERT INTO requisito (nombre_requisito, descripcion, tipo_requisito)
     VALUES (?, ?, ?)`,
    [data.nombre_requisito, data.descripcion ?? null, data.tipo_requisito]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarRequisitoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE requisito SET ${sets} WHERE id_requisito = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM requisito WHERE id_requisito = ?', [id]);
}
