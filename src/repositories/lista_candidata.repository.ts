import { pool } from '../config/database.js';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema.js';

// La carrera NO se guarda en lista_candidata: se toma del proceso electoral.
const BASE_QUERY = `
  SELECT
    l.id_lista, l.nombre_lista, l.lema, l.estado_revision, l.fecha_inscripcion,
    l.motivo_rechazo, l.fk_cedula_responsable, l.foto_url,
    p.id_proceso, p.nombre_proceso, p.estado AS estado_proceso,
    p.fk_id_carrera AS carrera_proceso, c.nombre_carrera
  FROM lista_candidata l
  JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
  LEFT JOIN carrera c ON c.id_carrera = p.fk_id_carrera
`;

/**
 * Filtro por carrera del proceso al que pertenece la lista:
 *  - undefined -> sin filtro (administración).
 *  - null      -> solo listas de procesos globales.
 *  - number    -> listas de procesos globales + los de esa carrera.
 */
export type FiltroCarrera = number | null | undefined;

function condicionCarrera(filtro: FiltroCarrera): { sql: string; params: any[] } {
  if (filtro === undefined) return { sql: '', params: [] };
  if (filtro === null) return { sql: ' AND p.fk_id_carrera IS NULL', params: [] };
  return { sql: ' AND (p.fk_id_carrera IS NULL OR p.fk_id_carrera = ?)', params: [filtro] };
}

export async function findAll(filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const where = sql ? ` WHERE 1=1${sql}` : '';
  const [rows] = await pool.query(`${BASE_QUERY}${where} ORDER BY l.fecha_inscripcion DESC`, params);
  return rows as any[];
}

/** Sin filtro de carrera: uso interno (portal del candidato, acciones de admin). */
export async function findById(id: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE l.id_lista = ?', [id]) as [any[], any];
  return rows[0] ?? null;
}

export async function findByProceso(procesoId: number, filtro: FiltroCarrera = undefined) {
  const { sql, params } = condicionCarrera(filtro);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE l.fk_id_proceso = ?${sql} ORDER BY l.nombre_lista`,
    [procesoId, ...params]
  );
  return rows as any[];
}

export async function create(data: CrearListaDTO) {
  const [result] = await pool.query(
    `INSERT INTO lista_candidata (fk_id_proceso, nombre_lista, lema, estado_revision, fecha_inscripcion, foto_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.fk_id_proceso, data.nombre_lista, data.lema ?? null, data.estado_revision ?? 'en_revision', data.fecha_inscripcion, data.foto_url ?? null]
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

/** Cambia el estado de revisión (aprobar/rechazar/retirar/enviar a revisión). */
export async function setEstadoRevision(id: number, estado: string, motivo: string | null = null) {
  await pool.query(
    'UPDATE lista_candidata SET estado_revision = ?, motivo_rechazo = ? WHERE id_lista = ?',
    [estado, motivo, id]
  );
  return findById(id);
}

// --- Soporte del portal del candidato -------------------------------------

/** La lista de la que un estudiante es responsable/dueño (o null). */
export async function findByResponsable(cedula: string) {
  const [rows] = await pool.query(
    BASE_QUERY + ' WHERE l.fk_cedula_responsable = ? LIMIT 1',
    [cedula]
  ) as [any[], any];
  return rows[0] ?? null;
}

/** ¿El estudiante ya es responsable de una lista en ese proceso? */
export async function existeResponsableEnProceso(cedula: string, procesoId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM lista_candidata WHERE fk_cedula_responsable = ? AND fk_id_proceso = ? LIMIT 1',
    [cedula, procesoId]
  ) as [any[], any];
  return rows.length > 0;
}

/** Crea una lista con dueño (portal candidato). */
export async function createDeCandidato(
  procesoId: number, nombre: string, lema: string | null, estado: string, cedulaResponsable: string,
  fotoUrl: string | null = null
) {
  const [result] = await pool.query(
    `INSERT INTO lista_candidata (fk_id_proceso, nombre_lista, lema, estado_revision, fecha_inscripcion, fk_cedula_responsable, foto_url)
     VALUES (?, ?, ?, ?, CURDATE(), ?, ?)`,
    [procesoId, nombre, lema, estado, cedulaResponsable, fotoUrl]
  ) as [any, any];
  return findById(result.insertId);
}

/** Actualiza solo los campos editables por el candidato (nombre, lema, foto). */
export async function updateDatos(id: number, campos: { nombre_lista?: string; lema?: string | null; foto_url?: string | null }) {
  const entradas = Object.entries(campos).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);
  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);
  await pool.query(`UPDATE lista_candidata SET ${sets} WHERE id_lista = ?`, [...valores, id]);
  return findById(id);
}
