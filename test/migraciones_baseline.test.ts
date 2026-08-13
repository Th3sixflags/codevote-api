import assert from 'node:assert/strict';
import test from 'node:test';
import { MIGRACIONES_HISTORICAS, resolverBaseline } from '../src/utils/migracionesBaseline.js';

test('instalación nueva: la reconciliación no ocurre sin confirmación explícita', () => {
  assert.throws(() => resolverBaseline([], 'operador'), /Uso seguro/);
  assert.throws(() => resolverBaseline(['--confirmar-base-existente', '--todas-historicas']), /MIGRATIONS_OPERATOR/);
});

test('base existente: el baseline registra solo migraciones históricas cerradas', () => {
  const nombres = resolverBaseline(['--confirmar-base-existente', '--todas-historicas'], 'operador');
  assert.deepEqual(nombres, MIGRACIONES_HISTORICAS);
  assert.ok(nombres.includes('2026-08-13_sesiones_cookie_rotacion.sql'));
  assert.ok(!nombres.includes('2026-08-13_control_migraciones.sql'));
});
