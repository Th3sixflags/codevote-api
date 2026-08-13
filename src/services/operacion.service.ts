import { pool } from '../config/database.js';

export async function comprobarReadiness() {
  const inicio = performance.now();
  try {
    await pool.query('SELECT 1 AS disponible');
    const [tablas] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'`
    ) as [Array<{ total: number }>, unknown];

    if (Number(tablas[0]?.total) !== 1) {
      return { listo: false, base_datos: 'ok', migraciones: 'pendiente', latencia_ms: Math.round(performance.now() - inicio) };
    }

    const [migraciones] = await pool.query('SELECT COUNT(*) AS total FROM schema_migrations') as [Array<{ total: number }>, unknown];
    return {
      listo: true,
      base_datos: 'ok',
      migraciones: 'ok',
      migraciones_registradas: Number(migraciones[0]?.total ?? 0),
      latencia_ms: Math.round(performance.now() - inicio),
    };
  } catch {
    return { listo: false, base_datos: 'no_disponible', migraciones: 'desconocido', latencia_ms: Math.round(performance.now() - inicio) };
  }
}
