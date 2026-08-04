import { pool } from '../config/database.js';

/**
 * Asignación administrativa de candidatura: el admin decide en qué papeleta
 * (votación) compite cada candidato. Cada persona tiene como máximo una
 * asignación (restricción UNIQUE en la tabla).
 */
const BASE_QUERY = `
  SELECT
    a.id_asignacion, a.fk_cedula_estudiante, a.fk_id_votacion,
    a.fecha_asignacion, a.estado,
    v.titulo_papeleta, v.estado AS estado_votacion,
    v.fk_id_carrera AS carrera_votacion, c.nombre_carrera,
    p.id_proceso, p.nombre_proceso, p.estado AS estado_proceso,
    p.fecha_inicio_inscripcion, p.fecha_fin_inscripcion,
    e.nombres, e.apellidos, e.rol
  FROM asignacion_candidatura a
  JOIN votacion v ON v.id_votacion = a.fk_id_votacion
  JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
  JOIN estudiante e ON e.cedula = a.fk_cedula_estudiante
  LEFT JOIN carrera c ON c.id_carrera = v.fk_id_carrera
`;

/** Asignación de un estudiante (cualquier estado), o null. */
export async function findByEstudiante(cedula: string) {
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE a.fk_cedula_estudiante = ?`,
    [cedula]
  ) as [any[], any];
  return rows[0] ?? null;
}

/**
 * Asignación ACTIVA de un estudiante, o null.
 *
 * Un proceso archivado no cuenta aunque la fila siguiera marcada como activa:
 * su candidatura terminó y no debe aparecer como asignación vigente ni
 * habilitar el portal.
 */
export async function findActivaDeEstudiante(cedula: string) {
  const [rows] = await pool.query(
    `${BASE_QUERY} WHERE a.fk_cedula_estudiante = ? AND a.estado = 'activa' AND p.archivado_at IS NULL`,
    [cedula]
  ) as [any[], any];
  return rows[0] ?? null;
}

/**
 * Asigna una papeleta al estudiante.
 *
 * La tabla tiene UNIQUE(fk_cedula_estudiante): una persona ocupa como mucho una
 * fila. Un INSERT a secas fallaba cuando ya existía una asignación anterior
 * —aunque estuviera 'retirada' por haberse archivado su proceso—, así que quien
 * ya había sido candidato no podía volver a serlo nunca.
 *
 * Con ON DUPLICATE KEY la fila se reutiliza: apunta a la papeleta nueva y
 * vuelve a estado 'activa'. El historial de participación no se pierde, porque
 * vive en `lista_candidata` y `candidato`, que el archivado conserva intactos.
 */
export async function create(cedula: string, votacionId: number) {
  await pool.query(
    `INSERT INTO asignacion_candidatura (fk_cedula_estudiante, fk_id_votacion, estado)
     VALUES (?, ?, 'activa')
     ON DUPLICATE KEY UPDATE fk_id_votacion = VALUES(fk_id_votacion),
                             estado = 'activa',
                             fecha_asignacion = NOW()`,
    [cedula, votacionId]
  );
  return findByEstudiante(cedula);
}

/** Reasigna la papeleta (se mantiene una sola fila por persona). */
export async function updateVotacion(cedula: string, votacionId: number) {
  await pool.query(
    `UPDATE asignacion_candidatura
     SET fk_id_votacion = ?, estado = 'activa', fecha_asignacion = NOW()
     WHERE fk_cedula_estudiante = ?`,
    [votacionId, cedula]
  );
  return findByEstudiante(cedula);
}

/** Retira la asignación eliminándola (deja libre al candidato). */
export async function remove(cedula: string) {
  const [result] = await pool.query(
    'DELETE FROM asignacion_candidatura WHERE fk_cedula_estudiante = ?',
    [cedula]
  ) as [any, any];
  return result.affectedRows > 0;
}

/**
 * ¿El candidato tiene una lista VIGENTE que impide mover o retirar su asignación?
 *
 * Bloquean las listas enviadas a revisión o aprobadas, y cualquiera que ya haya
 * recibido votos. Pero solo mientras su proceso siga vigente: una candidatura
 * de un proceso archivado es historial y no puede impedir una asignación
 * futura. Esta consulta no miraba el proceso, así que una lista retirada con
 * votos de un proceso ya archivado bloqueaba a esa persona para siempre.
 *
 * El corte es `archivado_at IS NOT NULL`, no `estado = 'archivado'`: un proceso
 * archivado conserva su estado anterior (finalizado o cancelado).
 */
export async function listaQueBloquea(cedula: string) {
  const [rows] = await pool.query(
    `SELECT l.id_lista, l.nombre_lista, l.estado_revision, p.nombre_proceso,
            EXISTS(SELECT 1 FROM voto vo WHERE vo.fk_id_lista = l.id_lista) AS tiene_votos
     FROM lista_candidata l
     JOIN proceso_electoral p ON p.id_proceso = l.fk_id_proceso
     WHERE l.fk_cedula_responsable = ?
       AND p.archivado_at IS NULL
       AND (l.estado_revision IN ('en_revision', 'aprobada')
            OR EXISTS(SELECT 1 FROM voto vo WHERE vo.fk_id_lista = l.id_lista))
     LIMIT 1`,
    [cedula]
  ) as [any[], any];
  return rows[0] ?? null;
}
