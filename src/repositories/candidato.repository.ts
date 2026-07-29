import { pool } from '../config/database.js';
import { CrearCandidatoDTO, ActualizarCandidatoDTO } from '../schemas/candidato.schema.js';

const BASE_QUERY = `
  SELECT
    c.id_candidato, c.cargo, c.cumple_requisitos, c.foto_url,
    c.fk_cedula_estudiante, e.nombres, e.apellidos,
    CONCAT(e.nombres, ' ', e.apellidos) AS nombre_completo,
    c.fk_id_lista, l.nombre_lista
  FROM candidato c
  JOIN estudiante e ON e.cedula = c.fk_cedula_estudiante
  JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
`;

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY c.id_candidato');
  return rows as any[];
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.id_candidato = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByLista(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.fk_id_lista = ?', [id]);
  return rows as any[];
}

/** Indica si el estudiante ya es candidato en la lista indicada. */
export async function existeEnLista(cedula: string, listaId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM candidato WHERE fk_cedula_estudiante = ? AND fk_id_lista = ? LIMIT 1',
    [cedula, listaId]
  ) as [any[], any];
  return rows.length > 0;
}

export async function create(data: CrearCandidatoDTO) {
  const [result] = await pool.query(
    `INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista)
     VALUES (?, ?, ?, ?, ?)`,
    [data.cargo, data.cumple_requisitos ?? null, data.foto_url ?? null, data.fk_cedula_estudiante, data.fk_id_lista]
  ) as [any, any];
  return findById(result.insertId);
}

export async function update(id: number, data: ActualizarCandidatoDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);

  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);

  await pool.query(`UPDATE candidato SET ${sets} WHERE id_candidato = ?`, [...valores, id]);
  return findById(id);
}

export async function remove(id: number) {
  await pool.query('DELETE FROM candidato WHERE id_candidato = ?', [id]);
}

// --- Soporte del portal del candidato -------------------------------------

/** Candidato con datos de su lista y proceso (para verificar dueño y estados). */
export async function findByIdConLista(id: number) {
  const [rows] = await pool.query(
    `SELECT c.id_candidato, c.cargo, c.fk_cedula_estudiante, c.fk_id_lista,
            l.fk_cedula_responsable, l.estado_revision, l.fk_id_proceso,
            p.estado AS estado_proceso
     FROM candidato c
     JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
     JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
     WHERE c.id_candidato = ?`,
    [id]
  ) as [any[], any];
  return rows[0] ?? null;
}

/** ¿Ya existe ese cargo en la lista? (excluye opcionalmente un candidato). */
export async function existeCargoEnLista(listaId: number, cargo: string, exceptId = 0): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM candidato WHERE fk_id_lista = ? AND cargo = ? AND id_candidato <> ? LIMIT 1',
    [listaId, cargo, exceptId]
  ) as [any[], any];
  return rows.length > 0;
}

/** ¿El estudiante ya es candidato en alguna lista de ese proceso? (listas incompatibles). */
export async function participaEnProceso(cedula: string, procesoId: number, exceptId = 0): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM candidato c
     JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
     WHERE c.fk_cedula_estudiante = ? AND l.fk_id_proceso = ? AND c.id_candidato <> ? LIMIT 1`,
    [cedula, procesoId, exceptId]
  ) as [any[], any];
  return rows.length > 0;
}
