import { pool } from '../config/database.js';
import { CrearPlanTrabajoDTO, ActualizarPlanTrabajoDTO } from '../schemas/plan_trabajo.schema.js';

const BASE_QUERY = `
  SELECT
    p.id_plan, p.area, p.propuesta, p.archivo_url,
    p.fk_id_lista, l.nombre_lista
  FROM plan_trabajo p
  JOIN lista_candidata l ON l.id_lista = p.fk_id_lista
  JOIN proceso_electoral pr ON pr.id_proceso = l.fk_id_proceso
`;

function condicionInstitucion(institucionId?: number): { sql: string; params: any[] } {
  if (institucionId === undefined) return { sql: '', params: [] };
  return { sql: ' AND pr.fk_id_institucion = ?', params: [institucionId] };
}

export async function findAll(institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const where = inst.sql ? ` WHERE 1=1${inst.sql}` : '';
  const [rows] = await pool.query(`${BASE_QUERY}${where} ORDER BY p.id_plan`, inst.params);
  return rows as any[];
}

export async function findById(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(`${BASE_QUERY} WHERE p.id_plan = ?${inst.sql}`, [id, ...inst.params]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByLista(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(`${BASE_QUERY} WHERE p.fk_id_lista = ?${inst.sql}`, [id, ...inst.params]);
  return rows as any[];
}

export async function create(data: CrearPlanTrabajoDTO) {
  const [result] = await pool.query(
    `INSERT INTO plan_trabajo (area, propuesta, archivo_url, fk_id_lista)
     VALUES (?, ?, ?, ?)`,
    [data.area, data.propuesta, data.archivo_url ?? null, data.fk_id_lista]
  ) as [any, any];
  return findById(result.insertId); // Se asume que el contexto validó la lista antes.
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

/** Plan con datos de su lista y proceso (para verificar dueño y estados). */
export async function findByIdConLista(id: number, institucionId?: number) {
  let where = ' WHERE pl.id_plan = ?';
  const params: any[] = [id];
  
  if (institucionId !== undefined) {
    where += ' AND p.fk_id_institucion = ?';
    params.push(institucionId);
  }

  const [rows] = await pool.query(
    `SELECT pl.id_plan, pl.fk_id_lista,
            l.fk_cedula_responsable, l.estado_revision, l.fk_id_proceso,
            p.estado AS estado_proceso
     FROM plan_trabajo pl
     JOIN lista_candidata l ON l.id_lista = pl.fk_id_lista
     JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
     ${where}`,
    params
  ) as [any[], any];
  return rows[0] ?? null;
}
