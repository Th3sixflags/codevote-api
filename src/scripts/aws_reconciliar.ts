import { pool } from '../config/database.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function checksum(nombre: string) {
  const filePath = path.join(process.cwd(), 'db', 'migrations', nombre);
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function run() {
  try {
    // 1. Ajustar los checksums de las migraciones históricas
    const historicas = [
      '2026-07-29_cedulas_validas.sql',
      '2026-07-29_portal_candidato.sql'
    ];

    for (const nombre of historicas) {
      const sha = await checksum(nombre);
      const [result] = await pool.query(
        'UPDATE schema_migrations SET sha256 = ? WHERE nombre_archivo = ?',
        [sha, nombre]
      ) as [any, any];
      
      if (result.affectedRows > 0) {
        console.log(`Checksum actualizado para ${nombre} -> ${sha}`);
      } else {
        console.log(`No se encontró ${nombre} en schema_migrations, o ya tenía el checksum correcto.`);
      }
    }

    // 2. Verificar si proceso_electoral ya admite NULL en las fechas de votación
    const [rows] = await pool.query(`
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proceso_electoral'
        AND COLUMN_NAME IN ('fecha_inicio_votacion', 'fecha_fin_votacion')
    `) as [any[], any];

    const inicio = rows.find(r => r.COLUMN_NAME === 'fecha_inicio_votacion');
    const fin = rows.find(r => r.COLUMN_NAME === 'fecha_fin_votacion');

    if (inicio?.IS_NULLABLE === 'YES' && fin?.IS_NULLABLE === 'YES') {
      const nombrePapeleta = '2026-08-13_votacion_por_papeleta.sql';
      const shaPapeleta = await checksum(nombrePapeleta);
      const operador = process.env.MIGRATIONS_OPERATOR || 'reconciliacion-aws';
      
      await pool.query(
        'INSERT IGNORE INTO schema_migrations (nombre_archivo, sha256, aplicada_por) VALUES (?, ?, ?)',
        [nombrePapeleta, shaPapeleta, operador]
      );
      console.log(`Migración ${nombrePapeleta} registrada como APLICADA exitosamente (sin ejecutar el SQL histórico, porque las columnas ya admiten NULL).`);
    } else {
      console.log('Las columnas aún NO aceptan NULL. Asegúrate de ejecutar la migración SQL manualmente o a través del script regular de registro.');
    }

    console.log('\n--- Estado Final ---');
    console.log('Ejecuta "npm run migraciones:estado" para verificar que todo esté en APLICADA.');
  } catch (error) {
    console.error('Error durante la reconciliación:', error);
  } finally {
    await pool.end();
  }
}

run();
