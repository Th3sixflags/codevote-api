import { pool } from '../config/database';
import { CrearVeeduriaDTO, ActualizarVeeduriaDTO } from '../schemas/veeduria.schema';

const BASE_QUERY = `
  SELECT
    vd.id_veeduria, vd.momento, vd.observacion,
    vd.fk_id_votacion, v.titulo_papeleta,
    vd.fk_id_veedor, ve.nombre AS veedor
  FROM veeduria vd
  JOIN votacion v ON v.id_votacion = vd.fk_id_votacion
  JOIN veedor ve ON ve.id_veedor = vd.fk_id_veedor
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY vd.id_veeduria');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE vd.id_veeduria = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByVotacion(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE vd.fk_id_votacion = ?', [id]);
  return rows as any[];
}

export async function create(data: CrearVeeduriaDTO) {
  const [result] = await pool.query(
    `INSERT INTO veeduria (fk_id_votacion, fk_id_veedor, momento, observacion)
     VALUES (?, ?, ?, ?)`,
    [data.fk_id_votacion, data.fk_id_veedor, data.momento, data.observacion ?? null]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarVeeduriaDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE veeduria SET ${sets} WHERE id_veeduria = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM veeduria WHERE id_veeduria = ?', [id]);
}
