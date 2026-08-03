import { pool } from '../config/database.js';

/** Papeleta que ya debería estar cerrada, con el contexto de su proceso. */
export interface PapeletaVencida {
  id_votacion: number;
  titulo_papeleta: string;
  fk_id_carrera: number | null;
  nombre_carrera: string | null;
  id_proceso: number;
  nombre_proceso: string;
  fecha_fin_votacion: string;
}

/**
 * Papeletas abiertas cuyo proceso ya pasó su `fecha_fin_votacion`.
 *
 * El corte llega como parámetro —la hora de Ecuador calculada en Node— en vez
 * de usar `NOW()`: así la comparación no depende de la zona horaria de la
 * sesión de MySQL ni de la del contenedor.
 *
 * Un proceso cancelado no cuenta: sus papeletas no se cierran por vencimiento,
 * porque el proceso ya no está en curso.
 */
export async function papeletasVencidas(corteEnEcuador: string): Promise<PapeletaVencida[]> {
  const [rows] = await pool.query(
    `SELECT v.id_votacion, v.titulo_papeleta, v.fk_id_carrera,
            c.nombre_carrera,
            p.id_proceso, p.nombre_proceso, p.fecha_fin_votacion
       FROM votacion v
       JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
       LEFT JOIN carrera c ON c.id_carrera = v.fk_id_carrera
      WHERE v.estado = 'abierta'
        AND p.fecha_fin_votacion IS NOT NULL
        AND p.fecha_fin_votacion <= ?
        AND p.estado <> 'cancelado'
      ORDER BY p.fecha_fin_votacion, v.id_votacion`,
    [corteEnEcuador]
  ) as [any[], any];
  return rows as PapeletaVencida[];
}

/**
 * Cierra la papeleta y dice si el cierre lo hizo ESTA llamada.
 *
 * El `AND estado = 'abierta'` es la garantía de idempotencia: si otra ejecución
 * (o el cierre manual) llegó antes, `affectedRows` vale 0 y quien llama sabe
 * que no debe volver a emitir el acta, la notificación ni el correo.
 */
export async function cerrarSiSigueAbierta(votacionId: number): Promise<boolean> {
  const [resultado] = await pool.query(
    `UPDATE votacion SET estado = 'cerrada' WHERE id_votacion = ? AND estado = 'abierta'`,
    [votacionId]
  ) as [any, any];
  return resultado.affectedRows > 0;
}

/** ¿La papeleta ya tiene acta de escrutinio? Evita emitir dos. */
export async function tieneActa(votacionId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT 1 FROM acta_resultados WHERE fk_id_votacion = ? LIMIT 1',
    [votacionId]
  ) as [any[], any];
  return rows.length > 0;
}

/**
 * Emite el acta de escrutinio de la papeleta.
 *
 * Es el rastro de auditoría del cierre: solo cifras agregadas y el nombre de la
 * lista ganadora. No guarda ninguna cédula, así que no relaciona a nadie con su
 * voto. Aparece en el registro de auditoría del panel junto a las demás actas.
 */
export async function emitirActa(datos: {
  votacionId: number;
  totalVotantes: number;
  validos: number;
  blancos: number;
  nulos: number;
  ganadora: string | null;
}) {
  await pool.query(
    `INSERT INTO acta_resultados
       (fk_id_votacion, total_votantes, votos_validos, votos_blanco, votos_nulos, lista_ganadora)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [datos.votacionId, datos.totalVotantes, datos.validos, datos.blancos, datos.nulos, datos.ganadora]
  );
}

/** Administración activa: destinatarios del aviso de cierre. */
export async function administradoresActivos(): Promise<
  Array<{ cedula: string; nombres: string; apellidos: string; correo_institucional: string }>
> {
  const [rows] = await pool.query(
    `SELECT cedula, nombres, apellidos, correo_institucional
       FROM estudiante
      WHERE rol = 'admin' AND estado_academico = 'activo'
      ORDER BY apellidos, nombres`
  ) as [any[], any];
  return rows as any[];
}
