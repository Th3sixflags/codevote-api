import { pool } from '../config/database.js';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema.js';

const BASE_QUERY = `
  SELECT
    l.id_lista, l.nombre_lista, l.lema, l.estado_revision, l.fecha_inscripcion,
    l.motivo_rechazo, l.fk_cedula_responsable,
    p.id_proceso, p.nombre_proceso, p.estado AS estado_proceso
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
  procesoId: number, nombre: string, lema: string | null, estado: string, cedulaResponsable: string
) {
  const [result] = await pool.query(
    `INSERT INTO lista_candidata (fk_id_proceso, nombre_lista, lema, estado_revision, fecha_inscripcion, fk_cedula_responsable)
     VALUES (?, ?, ?, ?, CURDATE(), ?)`,
    [procesoId, nombre, lema, estado, cedulaResponsable]
  ) as [any, any];
  return findById(result.insertId);
}

/** Actualiza solo los campos editables por el candidato (nombre, lema). */
export async function updateDatos(id: number, campos: { nombre_lista?: string; lema?: string | null }) {
  const entradas = Object.entries(campos).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return findById(id);
  const sets    = entradas.map(([k]) => `${k} = ?`).join(', ');
  const valores = entradas.map(([, v]) => v);
  await pool.query(`UPDATE lista_candidata SET ${sets} WHERE id_lista = ?`, [...valores, id]);
  return findById(id);
}
