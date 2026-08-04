/**
 * Documento de respaldo de un plan de trabajo.
 *
 * El campo aceptaba `z.string().max(255)`, o sea cualquier texto. En producción
 * apareció un plan con `archivo_url = 'aprobada'`: el formulario ofrece una
 * casilla de URL libre y guardaba tal cual lo que se escribiera. Solo deben
 * pasar: vacío, la ruta que genera la subida de PDF, o una URL https.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { archivoPlanSchema } from '../src/schemas/common.js';
import { crearPlanTrabajoSchema } from '../src/schemas/plan_trabajo.schema.js';

const BASE = { area: 'academico' as const, propuesta: 'Mejorar tutorías', fk_id_lista: 1 };

test('rechaza el valor que se coló en producción', () => {
  assert.equal(archivoPlanSchema.safeParse('aprobada').success, false);
  assert.equal(crearPlanTrabajoSchema.safeParse({ ...BASE, archivo_url: 'aprobada' }).success, false);
});

test('rechaza cualquier texto que no sea una ubicación', () => {
  for (const valor of ['pendiente', 'en_revision', 'sí', 'documento.pdf', 'www.ejemplo.com', '../../etc/passwd']) {
    assert.equal(archivoPlanSchema.safeParse(valor).success, false, `debería rechazar "${valor}"`);
  }
});

test('rechaza http y otros protocolos', () => {
  for (const valor of ['http://ejemplo.com/plan.pdf', 'ftp://ejemplo.com/plan.pdf', 'javascript:alert(1)', 'file:///etc/passwd']) {
    assert.equal(archivoPlanSchema.safeParse(valor).success, false, `debería rechazar "${valor}"`);
  }
});

test('acepta la ruta que genera la subida de PDF del portal', () => {
  const r = archivoPlanSchema.safeParse('/api/uploads/planes/plan-1710000017-1754170000000.pdf');
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('no acepta una ruta de uploads que no sea PDF ni de otra carpeta', () => {
  assert.equal(archivoPlanSchema.safeParse('/api/uploads/planes/plan.exe').success, false);
  assert.equal(archivoPlanSchema.safeParse('/api/uploads/otros/plan.pdf').success, false);
});

test('ya NO acepta una URL https externa', () => {
  // El respaldo tiene que ser un PDF subido a CodeVote: un enlace externo puede
  // cambiar, caducar o pedir permisos que la administración no tiene al revisar.
  for (const valor of [
    'https://drive.google.com/file/d/abc123/view',
    'https://ejemplo.com/plan.pdf',
    'https://uide.edu.ec/planes/lista-1.pdf',
  ]) {
    assert.equal(archivoPlanSchema.safeParse(valor).success, false, `debería rechazar "${valor}"`);
  }
});

test('vacío y null significan "todavía sin documento" y se guardan como null', () => {
  assert.equal(archivoPlanSchema.parse(''), null);
  assert.equal(archivoPlanSchema.parse(null), null);
});

test('el plan se puede crear sin documento', () => {
  const r = crearPlanTrabajoSchema.safeParse(BASE);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('respeta el límite de 255 caracteres de la columna', () => {
  const larga = `/api/uploads/planes/${'a'.repeat(250)}.pdf`;
  assert.ok(larga.length > 255);
  assert.equal(archivoPlanSchema.safeParse(larga).success, false);
});
