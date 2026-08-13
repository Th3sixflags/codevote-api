import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { pool } from '../src/config/database.js';
import { comprobarReadiness } from '../src/services/operacion.service.js';

const queryOriginal = pool.query.bind(pool);

after(async () => {
  (pool as any).query = queryOriginal;
  await pool.end();
});

test('readiness confirma MySQL y ledger de migraciones', async () => {
  (pool as any).query = async (sql: string) => {
    if (sql.includes('information_schema.TABLES')) return [[{ total: 1 }], []];
    if (sql.includes('FROM schema_migrations')) return [[{ total: 6 }], []];
    return [[{ disponible: 1 }], []];
  };
  const estado = await comprobarReadiness();
  assert.deepEqual(estado.base_datos, 'ok');
  assert.equal(estado.migraciones, 'ok');
  assert.equal(estado.migraciones_registradas, 6);
  assert.equal(estado.listo, true);
});

test('readiness no declara listo un servidor sin ledger', async () => {
  (pool as any).query = async (sql: string) => {
    if (sql.includes('information_schema.TABLES')) return [[{ total: 0 }], []];
    return [[{ disponible: 1 }], []];
  };
  const estado = await comprobarReadiness();
  assert.deepEqual(estado, {
    listo: false,
    base_datos: 'ok',
    migraciones: 'pendiente',
    latencia_ms: estado.latencia_ms,
  });
});

test('readiness no declara listo un ledger sin migraciones registradas', async () => {
  (pool as any).query = async (sql: string) => {
    if (sql.includes('information_schema.TABLES')) return [[{ total: 1 }], []];
    if (sql.includes('FROM schema_migrations')) return [[{ total: 0 }], []];
    return [[{ disponible: 1 }], []];
  };
  const estado = await comprobarReadiness();
  assert.equal(estado.listo, false);
  assert.equal(estado.migraciones, 'pendiente');
  assert.equal(estado.migraciones_registradas, 0);
});
