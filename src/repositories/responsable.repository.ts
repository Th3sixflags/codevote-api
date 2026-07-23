import { pool } from '../config/database.js';
import { CrearResponsableDTO, ActualizarResponsableDTO } from '../schemas/responsable.schema.js';

const BASE_QUERY = `
  SELECT * FROM responsable
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY id_responsable');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE id_responsable = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearResponsableDTO) {
  const [result] = await pool.query(
    `INSERT INTO responsable (nombres, apellidos, cargo, correo)
     VALUES (?, ?, ?, ?)`,
    [data.nombres, data.apellidos, data.cargo ?? null, data.correo]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarResponsableDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE responsable SET ${sets} WHERE id_responsable = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM responsable WHERE id_responsable = ?', [id]);
}
