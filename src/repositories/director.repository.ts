import { pool } from '../config/database.js';
import { CrearDirectorDTO, ActualizarDirectorDTO } from '../schemas/director.schema.js';

const BASE_QUERY = `
  SELECT * FROM director
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY id_director');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE id_director = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearDirectorDTO) {
  const [result] = await pool.query(
    `INSERT INTO director (nombres, apellidos, correo)
     VALUES (?, ?, ?)`,
    [data.nombres, data.apellidos, data.correo]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarDirectorDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE director SET ${sets} WHERE id_director = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM director WHERE id_director = ?', [id]);
}
