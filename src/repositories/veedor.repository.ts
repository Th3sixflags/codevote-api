import { pool } from '../config/database';
import { CrearVeedorDTO, ActualizarVeedorDTO } from '../schemas/veedor.schema';

const BASE_QUERY = `
  SELECT * FROM veedor
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY id_veedor');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE id_veedor = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearVeedorDTO) {
  const [result] = await pool.query(
    `INSERT INTO veedor (nombre, institucion, tipo_veedor, correo)
     VALUES (?, ?, ?, ?)`,
    [data.nombre, data.institucion ?? null, data.tipo_veedor, data.correo]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarVeedorDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE veedor SET ${sets} WHERE id_veedor = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM veedor WHERE id_veedor = ?', [id]);
}
