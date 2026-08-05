import { pool } from '../config/database.js';

/**
 * Rutas de archivo que SÍ están en uso, para poder distinguir las huérfanas.
 *
 * La lista de columnas es exhaustiva a propósito: si mañana se añade otra tabla
 * con una imagen y no se agrega aquí, la limpieza borraría archivos que sí se
 * están usando. Por eso la consulta es un UNION explícito y no algo automático
 * sobre el esquema: obliga a pensarlo al añadir la columna.
 */
export async function rutasEnUso(): Promise<Set<string>> {
  const [rows] = await pool.query(
    `SELECT foto_url    AS ruta FROM estudiante          WHERE foto_url IS NOT NULL
     UNION SELECT foto_url     FROM proceso_electoral    WHERE foto_url IS NOT NULL
     UNION SELECT foto_url     FROM votacion             WHERE foto_url IS NOT NULL
     UNION SELECT foto_url     FROM lista_candidata      WHERE foto_url IS NOT NULL
     UNION SELECT foto_url     FROM candidato            WHERE foto_url IS NOT NULL
     UNION SELECT archivo_url  FROM plan_trabajo         WHERE archivo_url IS NOT NULL`
  ) as [any[], any];

  // Se guarda solo el nombre del archivo: es lo que se compara contra el disco,
  // y así da igual que la URL guardada tenga o no el dominio delante.
  return new Set(
    rows
      .map((r) => String(r.ruta ?? '').split('/').pop())
      .filter((nombre): nombre is string => Boolean(nombre))
  );
}
