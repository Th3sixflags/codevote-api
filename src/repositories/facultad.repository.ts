import { pool } from '../config/database.js';
import { CrearFacultadDTO, ActualizarFacultadDTO } from '../schemas/facultad.schema.js';

const BASE_QUERY = `
  SELECT * FROM facultad
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY id_facultad');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE id_facultad = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearFacultadDTO) {
  const [result] = await pool.query(
    `INSERT INTO facultad (nombre_facultad)
     VALUES (?)`,
    [data.nombre_facultad]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarFacultadDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE facultad SET ${sets} WHERE id_facultad = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM facultad WHERE id_facultad = ?', [id]);
}
