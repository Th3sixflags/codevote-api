import { pool } from '../config/database.js';
import { CrearEstudianteDTO, ActualizarEstudianteDTO } from '../schemas/estudiante.schema.js';

// Se incluye la asignación de candidatura (cuando existe) para que el panel
// administrativo sepa en qué papeleta compite cada candidato.
const BASE_QUERY = `
  SELECT
    e.cedula, e.nombres, e.apellidos, e.correo_institucional, e.promedio, e.estado_academico, e.rol, e.foto_url,
    -- La clave foránea tal como la guarda la fila. Se devuelve además de
    -- c.id_carrera porque el JOIN es LEFT: si la carrera se borrara,
    -- c.id_carrera llegaría NULL y se perdería el valor que el estudiante
    -- tiene realmente asignado. Es la que el formulario de edición precarga.
    e.fk_id_carrera,
    c.id_carrera, c.nombre_carrera,
    CASE WHEN p.id_proceso IS NULL THEN NULL ELSE a.fk_id_votacion END AS asig_votacion,
    CASE WHEN p.id_proceso IS NULL THEN NULL ELSE a.estado END AS asig_estado,
    CASE WHEN p.id_proceso IS NULL THEN NULL ELSE a.fecha_asignacion END AS asig_fecha,
    CASE WHEN p.id_proceso IS NULL THEN NULL ELSE v.titulo_papeleta END AS asig_papeleta,
    CASE WHEN p.id_proceso IS NULL THEN NULL ELSE ac.nombre_carrera END AS asig_carrera,
    p.id_proceso AS asig_proceso, p.nombre_proceso AS asig_nombre_proceso
  FROM estudiante e
  LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
  LEFT JOIN asignacion_candidatura a ON a.fk_cedula_estudiante = e.cedula
  LEFT JOIN votacion v ON v.id_votacion = a.fk_id_votacion
  LEFT JOIN carrera ac ON ac.id_carrera = v.fk_id_carrera
  LEFT JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
`;

// Desde 2026-08-14 los datos que cambian por tenant viven en
// estudiante_institucion. Se mantiene BASE_QUERY para instalaciones que aún
// no han ejecutado la migración y para consultas históricas sin tenant.
const MEMBERSHIP_QUERY = `
  SELECT
    m.cedula, m.nombres, m.apellidos, m.correo_institucional, m.promedio,
    m.estado_academico, m.rol, m.foto_url, m.fk_id_carrera,
    c.id_carrera, c.nombre_carrera,
    a.fk_id_votacion AS asig_votacion, a.estado AS asig_estado, a.fecha_asignacion AS asig_fecha,
    v.titulo_papeleta AS asig_papeleta, ac.nombre_carrera AS asig_carrera,
    p.id_proceso AS asig_proceso, p.nombre_proceso AS asig_nombre_proceso
  FROM estudiante_por_institucion m
  LEFT JOIN carrera c ON c.id_carrera = m.fk_id_carrera AND c.fk_id_institucion = m.fk_id_institucion
  LEFT JOIN asignacion_candidatura a ON a.fk_cedula_estudiante = m.cedula
  LEFT JOIN votacion v ON v.id_votacion = a.fk_id_votacion
  LEFT JOIN carrera ac ON ac.id_carrera = v.fk_id_carrera
  LEFT JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
    AND p.fk_id_institucion = m.fk_id_institucion
`;

/** Agrupa los campos de la asignación en un objeto (o null si no tiene). */
function conAsignacion(row: any) {
  if (!row) return row;
  const {
    asig_votacion, asig_estado, asig_fecha, asig_papeleta, asig_carrera,
    asig_proceso, asig_nombre_proceso, ...estudiante
  } = row;
  return {
    ...estudiante,
    asignacion: asig_votacion == null ? null : {
      fk_id_votacion:   asig_votacion,
      titulo_papeleta:  asig_papeleta,
      nombre_carrera:   asig_carrera,
      id_proceso:       asig_proceso,
      nombre_proceso:   asig_nombre_proceso,
      estado:           asig_estado,
      fecha_asignacion: asig_fecha,
    },
  };
}

export async function findAll(institucionId?: number) {
  if (institucionId !== undefined) {
    const [rows] = await pool.query(
      MEMBERSHIP_QUERY + ' WHERE m.fk_id_institucion = ? ORDER BY m.apellidos, m.nombres',
      [institucionId]
    ) as [any[], any];
    return rows.map(conAsignacion);
  }
  const filtro = institucionId !== undefined ? ' WHERE e.fk_id_institucion = ?' : '';
  const params = institucionId !== undefined ? [institucionId] : [];
  const [rows] = await pool.query(BASE_QUERY + filtro + ' ORDER BY e.apellidos, e.nombres', params);
  return (rows as any[]).map(conAsignacion);
}

export async function findByCedula(cedula: string, institucionId?: number) {
  if (institucionId !== undefined) {
    const [rows] = await pool.query(
      MEMBERSHIP_QUERY + ' WHERE m.cedula = ? AND m.fk_id_institucion = ?',
      [cedula, institucionId]
    ) as [any[], any];
    return conAsignacion(rows[0] ?? null);
  }
  const filtroInstitucion = institucionId === undefined ? '' : ' AND e.fk_id_institucion = ?';
  const params = institucionId === undefined ? [cedula] : [cedula, institucionId];
  const [rows] = await pool.query(
    BASE_QUERY + ` WHERE e.cedula = ?${filtroInstitucion}`,
    params
  ) as [any[], any];
  return conAsignacion(rows[0] ?? null);
}

/** Carrera del estudiante (o null si no tiene ninguna asignada). */
export async function findCarreraId(cedula: string, institucionId?: number): Promise<number | null> {
  const [rows] = institucionId === undefined
    ? await pool.query('SELECT fk_id_carrera FROM estudiante WHERE cedula = ?', [cedula]) as [any[], any]
    : await pool.query(
      'SELECT fk_id_carrera FROM estudiante_por_institucion WHERE cedula = ? AND fk_id_institucion = ? AND membresia_activa = 1',
      [cedula, institucionId]
    ) as [any[], any];
  const valor = rows[0]?.fk_id_carrera;
  return valor == null ? null : Number(valor);
}

export async function findByEmail(email: string) {
  const [rows] = await pool.query('SELECT * FROM estudiante WHERE correo_institucional = ?', [email]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearEstudianteDTO, institucionId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [identidad] = await conn.query('SELECT cedula FROM estudiante WHERE cedula = ? FOR UPDATE', [data.cedula]) as [any[], any];
    if (identidad.length === 0) {
      await conn.query(
        `INSERT INTO estudiante
           (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico,
            fk_id_carrera, password, rol, debe_cambiar_password, fk_id_institucion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.cedula, data.nombres, data.apellidos, data.correo_institucional,
         data.promedio ?? null, data.estado_academico ?? 'activo', data.fk_id_carrera ?? null,
         null, data.rol ?? 'estudiante', 0, institucionId]
      );
    }
    await conn.query(
      `INSERT INTO estudiante_institucion
         (cedula, fk_id_institucion, nombres, apellidos, correo_institucional, promedio,
          estado_academico, fk_id_carrera, fecha_ingreso, membresia_activa, rol, foto_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [data.cedula, institucionId, data.nombres, data.apellidos, data.correo_institucional,
       data.promedio ?? null, data.estado_academico ?? 'activo', data.fk_id_carrera ?? null,
       data.fecha_ingreso ?? null, data.membresia_activa === false ? 0 : 1, data.rol ?? 'estudiante']
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return findByCedula(data.cedula, institucionId);
}

export async function update(cedula: string, data: ActualizarEstudianteDTO, institucionId?: number) {
  if (institucionId !== undefined) {
    const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entradas.length > 0) {
      const sets = entradas.map(([k]) => `${k} = ?`).join(', ');
      const valores = entradas.map(([, v]) => v);
      const [result] = await pool.query(
        `UPDATE estudiante_institucion SET ${sets} WHERE cedula = ? AND fk_id_institucion = ?`,
        [...valores, cedula, institucionId]
      ) as [any, any];
      // Compatibilidad con filas antiguas creadas directamente en estudiante
      // antes de la migración; el backfill las convierte, pero este fallback
      // evita que una integración concurrente quede sin poder editarse.
      if (Number(result.affectedRows ?? 0) === 0) {
        await pool.query(`UPDATE estudiante SET ${sets} WHERE cedula = ? AND fk_id_institucion = ?`, [...valores, cedula, institucionId]);
      }
    }
    return findByCedula(cedula, institucionId);
  }
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length > 0) {
    const sets = entradas.map(([k]) => `${k} = ?`).join(', ');
    const valores = entradas.map(([, v]) => v);
    const filtroInstitucion = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
    const params = institucionId === undefined
      ? [...valores, cedula]
      : [...valores, cedula, institucionId];
    await pool.query(`UPDATE estudiante SET ${sets} WHERE cedula = ?${filtroInstitucion}`, params);
  }
  return findByCedula(cedula, institucionId);
}

export async function remove(cedula: string, institucionId?: number) {
  if (institucionId !== undefined) {
    const [result] = await pool.query(
      'DELETE FROM estudiante_institucion WHERE cedula = ? AND fk_id_institucion = ?',
      [cedula, institucionId]
    ) as [any, any];
    if (Number(result.affectedRows ?? 0) > 0) return true;
    const [legacy] = await pool.query(
      'DELETE FROM estudiante WHERE cedula = ? AND fk_id_institucion = ?',
      [cedula, institucionId]
    ) as [any, any];
    return Number(legacy.affectedRows ?? 0) > 0;
  }
  const filtroInstitucion = institucionId === undefined ? '' : ' AND fk_id_institucion = ?';
  const params = institucionId === undefined ? [cedula] : [cedula, institucionId];
  const [result] = await pool.query(
    `DELETE FROM estudiante WHERE cedula = ?${filtroInstitucion}`,
    params
  ) as [any, any];
  return Number(result.affectedRows ?? 0) > 0;
}

// --- Portal del estudiante (self-service) ---------------------------------

/** Actualiza solo la foto de perfil del estudiante. */
export async function updateFoto(cedula: string, fotoUrl: string | null, institucionId?: number) {
  if (institucionId !== undefined) {
    await pool.query(
      'UPDATE estudiante_institucion SET foto_url = ? WHERE cedula = ? AND fk_id_institucion = ?',
      [fotoUrl, cedula, institucionId]
    );
    return findByCedula(cedula, institucionId);
  }
  await pool.query('UPDATE estudiante SET foto_url = ? WHERE cedula = ?', [fotoUrl, cedula]);
  return findByCedula(cedula);
}

/**
 * Búsqueda de posibles integrantes para una lista (portal del candidato).
 * Devuelve SOLO datos mínimos: cédula, nombres, apellidos y carrera. Nunca
 * contraseñas, correos ni promedios.
 *
 * @param carreraCompatible carrera exigida por la papeleta (null = papeleta
 *        global: cualquier carrera sirve).
 * @param texto             búsqueda por nombres, apellidos o cédula.
 */
export async function buscarPosiblesIntegrantes(
  carreraCompatible: number | null,
  texto: string,
  institucionId: number,
  limite = 20
) {
  const patron = `%${texto}%`;
  const filtroCarrera = carreraCompatible == null ? '' : ' AND m.fk_id_carrera = ?';
  const params: any[] = [patron, patron, patron, institucionId];
  if (carreraCompatible != null) params.push(carreraCompatible);
  params.push(limite);

  const [rows] = await pool.query(
    `SELECT m.*, c.nombre_carrera
     FROM estudiante_por_institucion m
     LEFT JOIN carrera c ON c.id_carrera = m.fk_id_carrera AND c.fk_id_institucion = m.fk_id_institucion
     WHERE (m.nombres LIKE ? OR m.apellidos LIKE ? OR m.cedula LIKE ?)
       AND m.fk_id_institucion = ?
       ${filtroCarrera}
       -- La administración no se postula.
       AND m.rol <> 'admin'
       AND m.estado_academico = 'activo'
       AND m.membresia_activa = 1
       -- Excluye a quienes ya pertenecen a otra candidatura activa.
       AND NOT EXISTS (
         SELECT 1 FROM candidato ca
         JOIN lista_candidata l ON l.id_lista = ca.fk_id_lista
         JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
         WHERE ca.fk_cedula_estudiante = m.cedula
           AND l.estado_revision NOT IN ('rechazada', 'retirada')
           AND p.estado NOT IN ('finalizado', 'cancelado')
           AND p.fk_id_institucion = m.fk_id_institucion
           AND p.archivado_at IS NULL
       )
       -- Excluye a otros responsables: quien tiene una asignación activa es el
       -- presidente de su propia lista y no puede ser integrante de otra.
       AND NOT EXISTS (
         SELECT 1 FROM asignacion_candidatura a
         WHERE a.fk_cedula_estudiante = m.cedula AND a.estado = 'activa'
           AND EXISTS (
             SELECT 1 FROM votacion av
             JOIN proceso_electoral ap ON ap.id_proceso = av.fk_id_proceso
             WHERE av.id_votacion = a.fk_id_votacion
               AND ap.fk_id_institucion = m.fk_id_institucion
           )
       )
     ORDER BY m.apellidos, m.nombres
     LIMIT ?`,
    params
  );
  return rows as any[];
}
