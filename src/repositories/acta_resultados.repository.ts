import { pool } from '../config/database.js';
import { CrearActaResultadosDTO, ActualizarActaResultadosDTO } from '../schemas/acta_resultados.schema.js';

const BASE_QUERY = `
  SELECT
    a.id_acta, a.total_votantes, a.votos_validos, a.votos_blanco, a.votos_nulos,
    a.lista_ganadora, a.fecha_emision,
    a.fk_id_votacion, v.titulo_papeleta, v.estado AS estado_votacion
  FROM acta_resultados a
  JOIN votacion v ON v.id_votacion = a.fk_id_votacion
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

function condicionInstitucion(institucionId?: number): { sql: string; params: any[] } {
  if (institucionId === undefined) return { sql: '', params: [] };
  return { sql: ' AND p.fk_id_institucion = ?', params: [institucionId] };
}

export async function findAll(institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const where = inst.sql ? ` WHERE 1=1${inst.sql}` : '';
  const [rows] = await pool.query(`${BASE_QUERY}${where} ORDER BY a.id_acta`, inst.params);
  return rows as any[];
}

export async function findById(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(`${BASE_QUERY} WHERE a.id_acta = ?${inst.sql}`, [id, ...inst.params]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByVotacion(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(`${BASE_QUERY} WHERE a.fk_id_votacion = ?${inst.sql}`, [id, ...inst.params]);
  return rows as any[];
}

export async function create(data: CrearActaResultadosDTO) {
  const [result] = await pool.query(
    `INSERT INTO acta_resultados (fk_id_votacion, total_votantes, votos_validos, votos_blanco, votos_nulos, lista_ganadora, fecha_emision)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.fk_id_votacion, data.total_votantes ?? null, data.votos_validos ?? null, data.votos_blanco ?? null, data.votos_nulos ?? null, data.lista_ganadora ?? null, data.fecha_emision ?? null]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarActaResultadosDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE acta_resultados SET ${sets} WHERE id_acta = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM acta_resultados WHERE id_acta = ?', [id]);
}
