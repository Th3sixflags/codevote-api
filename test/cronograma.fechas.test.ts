/**
 * Fechas del cronograma electoral.
 *
 * El patrón estaba escrito como `/^\\d{4}-\\d{2}-\\d{2}$/`, que dentro de un
 * literal de expresión regular busca una barra invertida seguida de "d". El
 * resultado era que POST/PATCH /api/cronogramas devolvían 422 ante cualquier
 * fecha, incluso bien formada.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { crearCronogramaSchema, actualizarCronogramaSchema } from '../src/schemas/cronograma.schema.js';

const BASE = {
  fk_id_proceso: 1,
  fk_id_responsable: 1,
  actividad: 'Inscripción de listas',
  fecha_inicio: '2026-08-01',
  fecha_fin: '2026-08-10',
};

test('acepta un cronograma con fechas válidas', () => {
  const r = crearCronogramaSchema.safeParse(BASE);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('acepta que la actividad empiece y termine el mismo día', () => {
  const r = crearCronogramaSchema.safeParse({ ...BASE, fecha_inicio: '2026-08-05', fecha_fin: '2026-08-05' });
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('rechaza formatos de fecha inválidos', () => {
  for (const fecha of ['01-08-2026', '2026/08/01', '2026-8-1', 'mañana', '', '2026-08-01 08:00:00']) {
    const r = crearCronogramaSchema.safeParse({ ...BASE, fecha_inicio: fecha });
    assert.equal(r.success, false, `debería rechazar "${fecha}"`);
    assert.match(r.error!.issues[0].message, /YYYY-MM-DD/);
  }
});

test('rechaza que la fecha final sea anterior a la inicial', () => {
  const r = crearCronogramaSchema.safeParse({ ...BASE, fecha_inicio: '2026-08-10', fecha_fin: '2026-08-01' });
  assert.equal(r.success, false);
  const problema = r.error!.issues.find((i) => i.path.join('.') === 'fecha_fin');
  assert.ok(problema, 'el error debe señalar el campo fecha_fin');
  assert.match(problema!.message, /anterior a la de inicio/i);
});

test('la actualización parcial mantiene ambas reglas', () => {
  // Solo una fecha: no hay con qué comparar, así que pasa.
  assert.equal(actualizarCronogramaSchema.safeParse({ fecha_fin: '2026-08-20' }).success, true);
  // Formato inválido: falla igual que al crear.
  assert.equal(actualizarCronogramaSchema.safeParse({ fecha_fin: '20-08-2026' }).success, false);
  // Las dos fechas en orden incorrecto: falla.
  assert.equal(
    actualizarCronogramaSchema.safeParse({ fecha_inicio: '2026-09-01', fecha_fin: '2026-08-01' }).success,
    false
  );
});
