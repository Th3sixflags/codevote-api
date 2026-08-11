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
    a.fk_id_votacion AS asig_votacion, a.estado AS asig_estado, a.fecha_asignacion AS asig_fecha,
    v.titulo_papeleta AS asig_papeleta, ac.nombre_carrera AS asig_carrera,
    p.id_proceso AS asig_proceso, p.nombre_proceso AS asig_nombre_proceso
  FROM estudiante e
  LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
  LEFT JOIN asignacion_candidatura a ON a.fk_cedula_estudiante = e.cedula
  LEFT JOIN votacion v ON v.id_votacion = a.fk_id_votacion
  LEFT JOIN carrera ac ON ac.id_carrera = v.fk_id_carrera
  LEFT JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
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
  const filtro = institucionId !== undefined ? ' WHERE e.fk_id_institucion = ?' : '';
  const params = institucionId !== undefined ? [institucionId] : [];
  const [rows] = await pool.query(BASE_QUERY + filtro + ' ORDER BY e.apellidos, e.nombres', params);
  return (rows as any[]).map(conAsignacion);
}

export async function findByCedula(cedula: string) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE e.cedula = ?', [cedula]) as [any[], any];
  return conAsignacion(rows[0] ?? null);
}

/** Carrera del estudiante (o null si no tiene ninguna asignada). */
export async function findCarreraId(cedula: string): Promise<number | null> {
  const [rows] = await pool.query(
    'SELECT fk_id_carrera FROM estudiante WHERE cedula = ?',
    [cedula]
  ) as [any[], any];
  const valor = rows[0]?.fk_id_carrera;
  return valor == null ? null : Number(valor);
}

export async function findByEmail(email: string) {
  const [rows] = await pool.query('SELECT * FROM estudiante WHERE correo_institucional = ?', [email]) as [any[], any];
  return rows[0] ?? null;
}

export async function create(data: CrearEstudianteDTO) {
  await pool.query(
    `INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, promedio, estado_academico, fk_id_carrera, password, rol, debe_cambiar_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.cedula, data.nombres, data.apellidos, data.correo_institucional, data.promedio ?? null, data.estado_academico ?? 'activo', data.fk_id_carrera ?? null, null, data.rol ?? 'estudiante', 0]
  );
  return findByCedula(data.cedula);
}

export async function update(cedula: string, data: ActualizarEstudianteDTO) {
  const entradas = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entradas.length > 0) {
    const sets = entradas.map(([k]) => `${k} = ?`).join(', ');
    const valores = entradas.map(([, v]) => v);
    await pool.query(`UPDATE estudiante SET ${sets} WHERE cedula = ?`, [...valores, cedula]);
  }
  return findByCedula(cedula);
}

export async function remove(cedula: string) {
  await pool.query('DELETE FROM estudiante WHERE cedula = ?', [cedula]);
}

// --- Portal del estudiante (self-service) ---------------------------------

/** Actualiza solo la foto de perfil del estudiante. */
export async function updateFoto(cedula: string, fotoUrl: string | null) {
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
  limite = 20
) {
  const patron = `%${texto}%`;
  const filtroCarrera = carreraCompatible == null ? '' : ' AND e.fk_id_carrera = ?';
  const params: any[] = [patron, patron, patron];
  if (carreraCompatible != null) params.push(carreraCompatible);
  params.push(limite);

  const [rows] = await pool.query(
    `SELECT e.*, c.nombre_carrera
     FROM estudiante e
     LEFT JOIN carrera c ON c.id_carrera = e.fk_id_carrera
     WHERE (e.nombres LIKE ? OR e.apellidos LIKE ? OR e.cedula LIKE ?)
       ${filtroCarrera}
       -- La administración no se postula.
       AND e.rol <> 'admin'
       AND e.estado_academico = 'activo'
       -- Excluye a quienes ya pertenecen a otra candidatura activa.
       AND NOT EXISTS (
         SELECT 1 FROM candidato ca
         JOIN lista_candidata l ON l.id_lista = ca.fk_id_lista
         JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
         WHERE ca.fk_cedula_estudiante = e.cedula
           AND l.estado_revision NOT IN ('rechazada', 'retirada')
           AND p.estado NOT IN ('finalizado', 'cancelado')
           AND p.archivado_at IS NULL
       )
       -- Excluye a otros responsables: quien tiene una asignación activa es el
       -- presidente de su propia lista y no puede ser integrante de otra.
       AND NOT EXISTS (
         SELECT 1 FROM asignacion_candidatura a
         WHERE a.fk_cedula_estudiante = e.cedula AND a.estado = 'activa'
       )
     ORDER BY e.apellidos, e.nombres
     LIMIT ?`,
    params
  );
  return rows as any[];
}
