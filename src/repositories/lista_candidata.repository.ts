import { pool } from '../config/database.js';
import { calcularBloqueo, bandera } from '../utils/bloqueoEliminacion.js';
import { CARGO_PRESIDENTE, CARGOS_SECUNDARIOS } from '../schemas/common.js';
import { CrearListaDTO, ActualizarListaDTO } from '../schemas/lista_candidata.schema.js';

// La carrera NO se guarda en lista_candidata: se toma de la VOTACIÓN (papeleta)
// en la que compite la lista. `tiene_votos` indica si ya recibió votos: en ese
// caso no se puede eliminar (solo retirar), porque son evidencia electoral.
const BASE_QUERY = `
  SELECT
    l.id_lista, l.nombre_lista, l.lema, l.estado_revision, l.fecha_inscripcion,
    l.motivo_rechazo, l.fk_cedula_responsable, l.foto_url, l.fk_id_votacion,
    p.id_proceso, p.nombre_proceso, p.estado AS estado_proceso,
    vo.titulo_papeleta, vo.estado AS estado_votacion,
    vo.fk_id_carrera AS carrera_votacion, c.nombre_carrera,
    EXISTS(SELECT 1 FROM voto v WHERE v.fk_id_lista = l.id_lista) AS tiene_votos,
    -- Archivada por pertenecer a un proceso archivado. Se deriva del proceso en
    -- vez de duplicar el estado en la lista, así no pueden quedar desacompasados.
    (p.archivado_at IS NOT NULL) AS archivada,
    p.archivado_at
  FROM lista_candidata l
  JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
  LEFT JOIN votacion vo ON vo.id_votacion = l.fk_id_votacion
  LEFT JOIN carrera c ON c.id_carrera = vo.fk_id_carrera
`;

/** Añade puede_eliminar / motivo_bloqueo y quita la bandera cruda. */
function conBloqueo(row: any) {
  if (!row) return row;
  const { tiene_votos, ...lista } = row;
  return {
    ...lista,
    // MySQL devuelve los booleanos como 0/1.
    archivada: Number(lista.archivada) === 1,
    ...calcularBloqueo({ votos: bandera(tiene_votos) }),
  };
}

/**
 * Filtro por carrera de la PAPELETA en la que compite la lista:
 *  - undefined -> sin filtro (administración).
 *  - null      -> solo listas de papeletas globales.
 *  - number    -> listas de papeletas globales + la de esa carrera.
 */
export type FiltroCarrera = number | null | undefined;

/**
 * Qué listas puede ver quien consulta.
 *
 * Una candidatura solo es pública cuando la administración la aprueba: mientras
 * está en preparación, en revisión, rechazada o retirada no debe aparecer en
 * Elecciones. Antes cualquier estudiante veía todos los estados, así que se
 * enteraba de quién se había postulado y a quién habían rechazado.
 *
 *  - `filtro`: carrera de la papeleta (ver más abajo).
 *  - `soloAprobadas`: true para estudiantes y candidatos.
 *  - `cedula`: quien consulta. Su PROPIA lista (aquella de la que es
 *    responsable) sigue siendo visible aunque no esté aprobada; es la misma que
 *    gestiona desde el Portal del candidato.
 */
export interface VisibilidadListas {
  filtro: FiltroCarrera;
  soloAprobadas: boolean;
  cedula?: string | null;
}

/** Visibilidad de la administración: todas las listas, en cualquier estado. */
export const VISIBILIDAD_TOTAL: VisibilidadListas = {
  filtro: undefined, soloAprobadas: false, cedula: null,
};

function condicionCarrera(filtro: FiltroCarrera): { sql: string; params: any[] } {
  if (filtro === undefined) return { sql: '', params: [] };
  if (filtro === null) return { sql: ' AND vo.fk_id_carrera IS NULL', params: [] };
  return { sql: ' AND (vo.fk_id_carrera IS NULL OR vo.fk_id_carrera = ?)', params: [filtro] };
}

function condicionInstitucion(institucionId?: number): { sql: string; params: any[] } {
  if (institucionId === undefined) return { sql: '', params: [] };
  return { sql: ' AND p.fk_id_institucion = ?', params: [institucionId] };
}

function condicionVisibilidad(vis: VisibilidadListas, institucionId?: number): { sql: string; params: any[] } {
  const { sql: sqlC, params: paramsC } = condicionCarrera(vis.filtro);
  const { sql: sqlI, params: paramsI } = condicionInstitucion(institucionId);
  
  const baseSql = sqlC + sqlI;
  const baseParams = [...paramsC, ...paramsI];
  
  if (!vis.soloAprobadas) return { sql: baseSql, params: baseParams };
  if (vis.cedula) {
    return {
      sql: `${baseSql} AND (l.estado_revision = 'aprobada' OR l.fk_cedula_responsable = ?)`,
      params: [...baseParams, vis.cedula],
    };
  }
  return { sql: `${baseSql} AND l.estado_revision = 'aprobada'`, params: baseParams };
}

/** ¿Esta fila de lista es visible para quien consulta? (mismo criterio que el SQL). */
export function listaVisible(lista: any, vis: VisibilidadListas): boolean {
  if (!vis.soloAprobadas) return true;
  if (String(lista?.estado_revision ?? '').toLowerCase() === 'aprobada') return true;
  return !!vis.cedula && lista?.fk_cedula_responsable === vis.cedula;
}

export async function findAll(vis: VisibilidadListas = VISIBILIDAD_TOTAL, institucionId?: number) {
  const { sql, params } = condicionVisibilidad(vis, institucionId);
  const where = sql ? ` WHERE 1=1${sql}` : '';
  const [rows] = await pool.query(`${BASE_QUERY}${where} ORDER BY l.fecha_inscripcion DESC`, params);
  return (rows as any[]).map(conBloqueo);
}

/**
 * Sin filtro alguno: uso INTERNO (portal del candidato, acciones de admin). Lo
 * que se devuelva a quien consulta pasa además por `listaVisible`.
 */
export async function findById(id: number, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE l.id_lista = ?${inst.sql}`,
    [id, ...inst.params]
  ) as [any[], any];
  return conBloqueo(rows[0] ?? null);
}

export async function findByProceso(procesoId: number, vis: VisibilidadListas = VISIBILIDAD_TOTAL, institucionId?: number) {
  const { sql, params } = condicionVisibilidad(vis, institucionId);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE l.fk_id_proceso = ?${sql} ORDER BY l.nombre_lista`,
    [procesoId, ...params]
  );
  return (rows as any[]).map(conBloqueo);
}

/** Listas que compiten en una papeleta concreta. */
export async function findByVotacion(votacionId: number, vis: VisibilidadListas = VISIBILIDAD_TOTAL, institucionId?: number) {
  const { sql, params } = condicionVisibilidad(vis, institucionId);
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE l.fk_id_votacion = ?${sql} ORDER BY l.nombre_lista`,
    [votacionId, ...params]
  );
  return (rows as any[]).map(conBloqueo);
}

/**
 * Crea una lista dentro de una papeleta. El proceso NO se pide: se deriva de la
 * votación, para que no puedan quedar inconsistentes.
 */
export async function create(data: CrearListaDTO, procesoId: number) {
  const [result] = await pool.query(
    `INSERT INTO lista_candidata (fk_id_proceso, fk_id_votacion, nombre_lista, lema, estado_revision, fecha_inscripcion, foto_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [procesoId, data.fk_id_votacion, data.nombre_lista, data.lema ?? null, data.estado_revision ?? 'en_revision', data.fecha_inscripcion, data.foto_url ?? null]
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
export async function findByResponsable(cedula: string, institucionId?: number) {
  const inst = condicionInstitucion(institucionId);
  // Un proceso archivado es historial: su lista ya no se gestiona desde el
  // portal, aunque siga existiendo y visible en el listado administrativo.
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE l.fk_cedula_responsable = ? AND p.archivado_at IS NULL${inst.sql} LIMIT 1`,
    [cedula, ...inst.params]
  ) as [any[], any];
  return conBloqueo(rows[0] ?? null);
}

/** ¿El estudiante ya es responsable de una lista en ese proceso? */
export async function existeResponsableEnProceso(cedula: string, procesoId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM lista_candidata WHERE fk_cedula_responsable = ? AND fk_id_proceso = ? LIMIT 1',
    [cedula, procesoId]
  ) as [any[], any];
  return rows.length > 0;
}

/** ¿El estudiante ya es responsable de una lista en esa papeleta? */
export async function existeResponsableEnVotacion(cedula: string, votacionId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM lista_candidata WHERE fk_cedula_responsable = ? AND fk_id_votacion = ? LIMIT 1',
    [cedula, votacionId]
  ) as [any[], any];
  return rows.length > 0;
}

/**
 * Crea la lista y registra a su responsable como Presidente en UNA transacción:
 * o quedan ambas cosas, o no queda ninguna. Así nunca existe una lista sin
 * presidente ni un presidente huérfano.
 */
export async function crearListaConPresidente(
  votacionId: number, procesoId: number, nombre: string, lema: string | null,
  estado: string, cedulaResponsable: string, fotoUrl: string | null = null
) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO lista_candidata (fk_id_proceso, fk_id_votacion, nombre_lista, lema, estado_revision, fecha_inscripcion, fk_cedula_responsable, foto_url)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
      [procesoId, votacionId, nombre, lema, estado, cedulaResponsable, fotoUrl]
    ) as [any, any];

    // El responsable entra automáticamente como Presidente de su propia lista.
    await conn.query(
      `INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista)
       VALUES (?, 0, NULL, ?, ?)`,
      [CARGO_PRESIDENTE, cedulaResponsable, result.insertId]
    );

    await conn.commit();
    return findById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Transfiere la responsabilidad de la lista a otro estudiante, en una única
 * transacción. Todo esto ocurre junto o no ocurre nada:
 *
 *   1. La lista apunta al nuevo responsable.
 *   2. El nuevo responsable queda como Presidente (asciende si ya era
 *      integrante; se inserta si no lo era) y el presidente anterior toma el
 *      cargo que aquel deja libre. Si el nuevo no era integrante, el anterior
 *      recibe el primer cargo sin ocupar: los cargos no se repiten dentro de
 *      una lista, así que no basta con bajarlo a Vocal.
 *   3. El nuevo responsable recibe la asignación de candidatura de la papeleta
 *      de la lista y pasa a rol 'candidato'.
 *   4. El anterior pierde su asignación y vuelve a 'estudiante', salvo que sea
 *      responsable de otra candidatura.
 */
export async function transferirResponsable(
  listaId: number, votacionId: number, nuevaCedula: string, anteriorCedula: string | null,
  institucionId?: number
) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [procesoRows] = await conn.query(
      `SELECT p.fk_id_institucion
         FROM votacion v
         JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
        WHERE v.id_votacion = ?
        LIMIT 1`,
      [votacionId]
    ) as [any[], any];
    const tenant = institucionId ?? Number(procesoRows[0]?.fk_id_institucion);
    if (!tenant) throw new Error('La papeleta no tiene institución asociada.');

    // 1. Nuevo responsable en la lista.
    await conn.query(
      'UPDATE lista_candidata SET fk_cedula_responsable = ? WHERE id_lista = ?',
      [nuevaCedula, listaId]
    );

    // 2. Intercambio de cargos. Primero se libera la presidencia (el índice
    //    único no admite dos presidentes ni siquiera a medio camino) y solo
    //    después se asciende al nuevo responsable.
    const [integrantes] = await conn.query(
      'SELECT id_candidato, cargo, fk_cedula_estudiante FROM candidato WHERE fk_id_lista = ?',
      [listaId]
    ) as [any[], any];

    const filaNueva     = integrantes.find((c) => c.fk_cedula_estudiante === nuevaCedula) ?? null;
    const filaPresidente = integrantes.find((c) => c.cargo === CARGO_PRESIDENTE) ?? null;

    if (filaPresidente && filaPresidente.id_candidato !== filaNueva?.id_candidato) {
      // El anterior hereda el cargo del nuevo responsable; si este no estaba en
      // la lista, ocupa el primer cargo libre (el servicio ya rechazó el caso
      // de una lista con los cinco cargos tomados).
      const ocupados = new Set(
        integrantes
          .filter((c) => c.id_candidato !== filaPresidente.id_candidato)
          .map((c) => c.cargo)
      );
      const cargoHeredado = filaNueva?.cargo ?? CARGOS_SECUNDARIOS.find((c) => !ocupados.has(c)) ?? 'Vocal';
      await conn.query(
        'UPDATE candidato SET cargo = ? WHERE id_candidato = ?',
        [cargoHeredado, filaPresidente.id_candidato]
      );
    }

    if (filaNueva) {
      await conn.query(
        'UPDATE candidato SET cargo = ? WHERE id_candidato = ?',
        [CARGO_PRESIDENTE, filaNueva.id_candidato]
      );
    } else {
      await conn.query(
        `INSERT INTO candidato (cargo, cumple_requisitos, foto_url, fk_cedula_estudiante, fk_id_lista)
         VALUES (?, 0, NULL, ?, ?)`,
        [CARGO_PRESIDENTE, nuevaCedula, listaId]
      );
    }

    // 3. Asignación de candidatura y rol del nuevo responsable.
    await conn.query(
      `INSERT INTO asignacion_candidatura (fk_cedula_estudiante, fk_id_votacion)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE fk_id_votacion = VALUES(fk_id_votacion),
                               estado = 'activa', fecha_asignacion = NOW()`,
      [nuevaCedula, votacionId]
    );
    await conn.query(
      `UPDATE estudiante_institucion
          SET rol = 'candidato'
        WHERE cedula = ? AND fk_id_institucion = ? AND rol <> 'admin'`,
      [nuevaCedula, tenant]
    );

    // 4. El responsable anterior deja de serlo: pierde la asignación y vuelve a
    //    'estudiante' salvo que administre otra candidatura.
    if (anteriorCedula && anteriorCedula !== nuevaCedula) {
      await conn.query(
        `DELETE a FROM asignacion_candidatura a
          JOIN votacion v ON v.id_votacion = a.fk_id_votacion
          JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
         WHERE a.fk_cedula_estudiante = ? AND p.fk_id_institucion = ?`,
        [anteriorCedula, tenant]
      );
      await conn.query(
        `UPDATE estudiante_institucion e
            SET e.rol = 'estudiante'
          WHERE e.cedula = ?
            AND e.fk_id_institucion = ?
            AND e.rol = 'candidato'
            AND NOT EXISTS (
              SELECT 1 FROM lista_candidata l
                JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
               WHERE l.fk_cedula_responsable = e.cedula
                 AND p.fk_id_institucion = e.fk_id_institucion
            )`,
        [anteriorCedula, tenant]
      );
    }

    await conn.commit();
    return findById(listaId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
