import { pool } from '../config/database';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema';

const BASE_QUERY = `
  SELECT
    l.id_lista, l.nombre_lista, l.lema, l.estado_revision, l.fecha_inscripcion,
    p.id_proceso, p.nombre_proceso
  FROM lista_candidata l
  JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY l.fecha_inscripcion DESC');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE l.id_lista = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByProceso(procesoId: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE l.fk_id_proceso = ? ORDER BY l.nombre_lista', [procesoId]);
  return rows as any[];
}

export async function create(data: CrearListaDTO) {
  const [result] = await pool.query(
    `INSERT INTO lista_candidata (fk_id_proceso, nombre_lista, lema, estado_revision, fecha_inscripcion)
     VALUES (?, ?, ?, ?, ?)`,
    [data.fk_id_proceso, data.nombre_lista, data.lema ?? null, data.estado_revision ?? 'en_revision', data.fecha_inscripcion]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarListaDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE lista_candidata SET ${sets} WHERE id_lista = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM lista_candidata WHERE id_lista = ?', [id]);
}
