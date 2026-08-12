import { pool } from '../config/database.js';
import { hashActa } from '../utils/hashActa.js';

/** Papeleta que ya debería estar cerrada, con el contexto de su proceso. */
export interface PapeletaVencida {
  id_votacion: number;
  titulo_papeleta: string;
  fk_id_carrera: number | null;
  nombre_carrera: string | null;
  id_proceso: number;
  nombre_proceso: string;
  fecha_fin_votacion: string;
  fk_id_institucion: number;
}

/**
 * Papeletas sin cerrar que ya vencieron, por cualquiera de sus dos plazos.
 *
 * Vence con el `fecha_fin_votacion` del proceso o con el `fecha_cierre` de la
 * propia papeleta, lo que ocurra primero. Antes solo se miraba el del proceso,
 * así que una papeleta que cerraba antes que su proceso se quedaba abierta en la
 * base: la API ya la daba por cerrada (ver utils/estadoVotacion.ts, que sí mira
 * los dos), pero nunca llegaba a emitirse su acta. Ahora las dos reglas
 * coinciden.
 *
 * Se recogen también las que siguen en 'pendiente'. Una papeleta cuya ventana
 * entera pasó con el servidor apagado nunca llegó a abrirse, pero tiene que
 * quedar cerrada igualmente: mientras no lo esté, `finalizarSiTodoCerrado` no
 * puede dar por terminado su proceso y este se queda colgado para siempre. Su
 * acta saldrá con cero votos, que es exactamente lo que ocurrió.
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
            p.id_proceso, p.nombre_proceso, p.fecha_fin_votacion, p.fk_id_institucion
       FROM votacion v
       JOIN proceso_electoral p ON p.id_proceso = v.fk_id_proceso
       LEFT JOIN carrera c ON c.id_carrera = v.fk_id_carrera
      WHERE v.estado <> 'cerrada'
        AND (
             (p.fecha_fin_votacion IS NOT NULL AND p.fecha_fin_votacion <= ?)
          OR (v.fecha_cierre       IS NOT NULL AND v.fecha_cierre       <= ?)
        )
        AND p.estado <> 'cancelado'
      ORDER BY p.fecha_fin_votacion, v.id_votacion`,
    [corteEnEcuador, corteEnEcuador]
  ) as [any[], any];
  return rows as PapeletaVencida[];
}

/**
 * Cierra la papeleta y dice si el cierre lo hizo ESTA llamada.
 *
 * El `AND estado <> 'cerrada'` es la garantía de idempotencia: si otra ejecución
 * (o el cierre manual) llegó antes, `affectedRows` vale 0 y quien llama sabe
 * que no debe volver a emitir el acta, la notificación ni el correo.
 *
 * Se admite cerrar desde 'pendiente' y no solo desde 'abierta': una papeleta
 * cuya ventana pasó entera sin que el servidor estuviera vivo nunca llegó a
 * abrirse, y aun así debe quedar cerrada para que su proceso pueda finalizar.
 */
export async function cerrarSiSigueAbierta(votacionId: number): Promise<boolean> {
  const [resultado] = await pool.query(
    `UPDATE votacion SET estado = 'cerrada' WHERE id_votacion = ? AND estado <> 'cerrada'`,
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
  fechaEmision: string;
}) {
  const sello = hashActa(datos);
  try {
    await pool.query(
      `INSERT INTO acta_resultados
         (fk_id_votacion, total_votantes, votos_validos, votos_blanco, votos_nulos,
          lista_ganadora, fecha_emision, hash_version, hash_algoritmo, hash_acta)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SHA-256', ?)`,
      [
        datos.votacionId, datos.totalVotantes, datos.validos, datos.blancos,
        datos.nulos, datos.ganadora, datos.fechaEmision, sello,
      ]
    );
  } catch (err: any) {
    // Despliegue compatible: el pipeline publica el backend antes de que la
    // migración se aplique manualmente en AWS. Solo se usa el INSERT histórico
    // cuando MySQL confirma que las columnas P1 todavía no existen.
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && err?.errno !== 1054) throw err;
    await pool.query(
      `INSERT INTO acta_resultados
         (fk_id_votacion, total_votantes, votos_validos, votos_blanco, votos_nulos,
          lista_ganadora, fecha_emision)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.votacionId, datos.totalVotantes, datos.validos, datos.blancos,
        datos.nulos, datos.ganadora, datos.fechaEmision,
      ]
    );
  }
}

/**
 * Marca el proceso como FINALIZADO si ya no queda nada por votar.
 *
 * Condiciones, todas en el mismo UPDATE para que la comprobación y la escritura
 * no puedan separarse:
 *
 *   - su periodo de votación ya venció;
 *   - no le queda ninguna papeleta sin cerrar;
 *   - tiene al menos una papeleta (un proceso sin papeletas no "termina": nunca
 *     empezó, y marcarlo finalizado sería inventarse una elección);
 *   - NO está cancelado ni archivado, que son estados finales decididos por la
 *     administración y que este automatismo no debe pisar;
 *   - todavía no estaba finalizado, para no repetir el aviso.
 *
 * Devuelve si esta llamada fue la que lo finalizó, de modo que quien llama sepa
 * si toca notificar. Es la misma garantía de idempotencia que el cierre de la
 * papeleta.
 */
export async function finalizarSiTodoCerrado(
  procesoId: number, corteEnEcuador: string
): Promise<boolean> {
  const [resultado] = await pool.query(
    `UPDATE proceso_electoral p
        SET p.estado = 'finalizado'
      WHERE p.id_proceso = ?
        AND p.estado NOT IN ('finalizado', 'cancelado')
        AND p.archivado_at IS NULL
        AND p.fecha_fin_votacion IS NOT NULL
        AND p.fecha_fin_votacion <= ?
        AND EXISTS (SELECT 1 FROM votacion v WHERE v.fk_id_proceso = p.id_proceso)
        AND NOT EXISTS (
          SELECT 1 FROM votacion v
           WHERE v.fk_id_proceso = p.id_proceso AND v.estado <> 'cerrada'
        )`,
    [procesoId, corteEnEcuador]
  ) as [any, any];
  return resultado.affectedRows > 0;
}

/**
 * Procesos ya vencidos que siguen sin finalizar y no tienen ninguna papeleta
 * abierta. Son los que quedaron a medias: se cerró su última papeleta a mano, o
 * el servidor se reinició justo después de cerrarlas.
 */
export async function procesosVencidosSinFinalizar(corteEnEcuador: string): Promise<number[]> {
  const [rows] = await pool.query(
    `SELECT p.id_proceso
       FROM proceso_electoral p
      WHERE p.estado NOT IN ('finalizado', 'cancelado')
        AND p.archivado_at IS NULL
        AND p.fecha_fin_votacion IS NOT NULL
        AND p.fecha_fin_votacion <= ?
        AND EXISTS (SELECT 1 FROM votacion v WHERE v.fk_id_proceso = p.id_proceso)
        AND NOT EXISTS (
          SELECT 1 FROM votacion v
           WHERE v.fk_id_proceso = p.id_proceso AND v.estado <> 'cerrada'
        )`,
    [corteEnEcuador]
  ) as [any[], any];
  return rows.map((r) => Number(r.id_proceso));
}

/** Nombre del proceso, para el aviso de finalización. */
export async function nombreDeProceso(procesoId: number): Promise<string | null> {
  const [rows] = await pool.query(
    'SELECT nombre_proceso FROM proceso_electoral WHERE id_proceso = ?',
    [procesoId]
  ) as [any[], any];
  return rows[0]?.nombre_proceso ?? null;
}

/** Administración activa: destinatarios del aviso de cierre. */
export async function administradoresActivos(institucionId: number): Promise<
  Array<{ cedula: string; nombres: string; apellidos: string; correo_institucional: string }>
> {
  const [rows] = await pool.query(
    `SELECT cedula, nombres, apellidos, correo_institucional
      FROM estudiante
      WHERE rol = 'admin' AND estado_academico = 'activo'
        AND fk_id_institucion = ?
      ORDER BY apellidos, nombres`
    , [institucionId]
  ) as [any[], any];
  return rows as any[];
}
