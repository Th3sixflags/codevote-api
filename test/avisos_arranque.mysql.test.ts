/**
 * Regresión MySQL real para el arranque de avisos.
 *
 * Producción conservó `plan_trabajo.archivo_url` con una collation diferente a
 * los `foto_url`. La primera pasada de avisos ejecuta la limpieza de archivos y
 * su UNION fallaba antes de que el mantenimiento pudiera terminar.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const uploadsTemporal = mkdtempSync(path.join(os.tmpdir(), 'codevote-avisos-'));
process.env.UPLOADS_DIR = uploadsTemporal;

const { pool } = await import('../src/config/database.js');
const { ejecutarPasadaDeAvisos } = await import('../src/tareas/avisosProgramados.js');

before(async () => {
  // Reproduce el estado histórico que provocó el error de producción.
  await pool.query(`
    ALTER TABLE plan_trabajo
      MODIFY COLUMN archivo_url VARCHAR(255)
      CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL
  `);
});

after(async () => {
  await pool.query(`
    ALTER TABLE plan_trabajo
      MODIFY COLUMN archivo_url VARCHAR(255)
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
  `);
  await pool.end();
  rmSync(uploadsTemporal, { recursive: true, force: true });
});

test('el arranque de avisos tolera rutas con collations históricas distintas', async () => {
  // Confirma que el fixture sí representa el incidente, no solo que la nueva
  // consulta funciona sobre una base vacía cualquiera.
  await assert.rejects(
    pool.query(`
      SELECT foto_url AS ruta FROM estudiante WHERE foto_url IS NOT NULL
      UNION SELECT archivo_url FROM plan_trabajo WHERE archivo_url IS NOT NULL
    `),
    (err: any) => err?.code === 'ER_CANT_AGGREGATE_NCOLLATIONS' || err?.errno === 1271
  );

  await assert.doesNotReject(ejecutarPasadaDeAvisos('arranque', true));
});
