import { pool } from '../config/database.js';
import { CARGO_PRESIDENTE } from '../schemas/common.js';
import { CrearCandidatoDTO, ActualizarCandidatoDTO } from '../schemas/candidato.schema.js';

// `es_responsable` marca al Presidente de la lista: la única persona con rol
// 'candidato' y acceso al Portal del candidato. El resto de integrantes sale
// aquí igual, pero conserva su rol 'estudiante'.
const BASE_QUERY = `
  SELECT
    c.id_candidato, c.cargo, c.cumple_requisitos, c.foto_url,
    c.fk_cedula_estudiante, c.fk_cedula_estudiante AS cedula,
    e.nombres, e.apellidos,
    CONCAT(e.nombres, ' ', e.apellidos) AS nombre_completo,
    c.fk_id_lista, l.nombre_lista,
    (l.fk_cedula_responsable IS NOT NULL
     AND l.fk_cedula_responsable = c.fk_cedula_estudiante) AS es_responsable
  FROM candidato c
  JOIN estudiante e ON e.cedula = c.fk_cedula_estudiante
  JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
`;

/** MySQL devuelve los booleanos como 0/1: se normalizan a boolean real. */
function normalizar(row: any) {
  if (!row) return row;
  return { ...row, es_responsable: Number(row.es_responsable) === 1 };
}

export async function findAll() {
  const [rows] = await pool.query(BASE_QUERY + ' ORDER BY c.id_candidato');
  return (rows as any[]).map(normalizar);
}

export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE c.id_candidato = ?', [id]) as [any[], any];
  return normalizar(rows[0] ?? null);
}

/**
 * Integrantes de una lista, con el Presidente (responsable) siempre primero
 * para que el frontend pueda mostrarlo encabezando la candidatura.
 */
export async function findByLista(id: number) {
  const [rows] = await pool.query(
    BASE_QUERY + ` WHERE c.fk_id_lista = ?
                   ORDER BY (c.cargo = ?) DESC, c.id_candidato`,
    [id, CARGO_PRESIDENTE]
  );
  return (rows as any[]).map(normalizar);
}

/** El Presidente (responsable) de la lista, o null si aún no lo tiene. */
export async function findPresidenteDeLista(listaId: number) {
  const [rows] = await pool.query(
    BASE_QUERY + ' WHERE c.fk_id_lista = ? AND c.cargo = ? LIMIT 1',
    [listaId, CARGO_PRESIDENTE]
  ) as [any[], any];
  return normalizar(rows[0] ?? null);
}

/** ¿La lista ya tiene Presidente? (opcionalmente excluye un candidato). */
export async function existePresidenteEnLista(listaId: number, exceptId = 0): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM candidato WHERE fk_id_lista = ? AND cargo = ? AND id_candidato <> ? LIMIT 1',
    [listaId, CARGO_PRESIDENTE, exceptId]
  ) as [any[], any];
  return rows.length > 0;
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
            p.estado AS estado_proceso,
            (l.fk_cedula_responsable IS NOT NULL
             AND l.fk_cedula_responsable = c.fk_cedula_estudiante) AS es_responsable
     FROM candidato c
     JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
     JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
     WHERE c.id_candidato = ?`,
    [id]
  ) as [any[], any];
  return normalizar(rows[0] ?? null);
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

/**
 * Candidatura ACTIVA del estudiante en cualquier proceso electoral vigente.
 * Una persona no puede postularse a Consejo Estudiantil y a representante de
 * carrera al mismo tiempo: solo una candidatura activa a la vez.
 *
 * Se consideran activas las listas que no fueron rechazadas ni retiradas, en
 * procesos que no estén finalizados, cancelados ni archivados.
 */
export async function candidaturaActiva(cedula: string, exceptId = 0) {
  const [rows] = await pool.query(
    `SELECT c.id_candidato, l.id_lista, l.nombre_lista, p.id_proceso, p.nombre_proceso, p.tipo_proceso
     FROM candidato c
     JOIN lista_candidata l ON l.id_lista = c.fk_id_lista
     JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
     WHERE c.fk_cedula_estudiante = ?
       AND c.id_candidato <> ?
       AND l.estado_revision NOT IN ('rechazada', 'retirada')
       AND p.estado NOT IN ('finalizado', 'cancelado')
       AND p.archivado_at IS NULL
     LIMIT 1`,
    [cedula, exceptId]
  ) as [any[], any];
  return rows[0] ?? null;
}
