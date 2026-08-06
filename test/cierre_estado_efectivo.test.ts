/**
 * Una elección terminada no puede seguir figurando como abierta.
 *
 * El fallo observado: pasada la hora final, la papeleta seguía apareciendo
 * abierta. Tenía dos causas encadenadas y aquí se cubren las dos.
 *
 *   1. Las consultas devolvían `votacion.estado` tal cual. Como el cierre corre
 *      cada minuto, entre la hora final y la pasada de la tarea había una
 *      ventana en la que la API afirmaba que se podía votar; y si el servidor
 *      estaba caído, la ventana no se cerraba nunca.
 *
 *   2. mysql2 devolvía los DATETIME como objetos Date interpretados en la zona
 *      horaria del PROCESO (UTC en Docker), así que una votación que terminaba a
 *      las 18:00 de Ecuador se comparaba como si terminara a las 13:00.
 *
 * Ahora la FECHA manda sobre el estado guardado, y la misma regla decide lo que
 * responden las consultas y lo que acepta POST /votos.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { disponibilidadDeVoto, estaVencida } from '../src/utils/estadoVotacion.js';
import { ahoraEnEcuador, ZONA_ECUADOR } from '../src/utils/zonaHoraria.js';

/** Papeleta abierta y en plazo, sobre la que se varía un solo dato por prueba. */
const ABIERTA = {
  estado: 'abierta',
  fecha_apertura: '2026-01-01 08:00:00',
  fecha_cierre: '2099-12-31 23:59:59',
  fecha_fin_votacion: '2099-12-31 23:59:59',
  estado_proceso: 'votacion',
  archivado: 0,
};

const AHORA = '2026-08-04 12:00:00';

// --- Antes de la hora final -------------------------------------------------

test('una papeleta abierta y en plazo permanece abierta', () => {
  const d = disponibilidadDeVoto(ABIERTA, AHORA);

  assert.equal(d.estado_efectivo, 'abierta');
  assert.equal(d.puede_votar, true);
  assert.equal(d.motivo_no_disponible, null);
  assert.equal(estaVencida(ABIERTA, AHORA), false);
});

test('un minuto antes del cierre todavía se puede votar', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_fin_votacion: '2026-08-04 12:01:00' }, AHORA);
  assert.equal(d.puede_votar, true);
});

// --- Pasada la hora final ---------------------------------------------------

test('pasada la hora final ya no se puede votar, aunque el estado diga abierta', () => {
  // Este es el caso exacto que se coló: la tarea aún no ha pasado.
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_fin_votacion: '2026-08-04 11:59:59' }, AHORA);

  assert.equal(d.estado_efectivo, 'cerrada');
  assert.equal(d.puede_votar, false);
  assert.equal(d.motivo_no_disponible, 'La votación ha finalizado.');
});

test('justo en la hora final la votación ya está cerrada', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_fin_votacion: AHORA }, AHORA);
  assert.equal(d.puede_votar, false);
});

test('el cierre propio de la papeleta también vence, aunque el proceso siga', () => {
  // Son dos plazos distintos y ninguno debería poder saltarse.
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_cierre: '2026-08-04 10:00:00' }, AHORA);

  assert.equal(d.estado_efectivo, 'cerrada');
  assert.equal(d.puede_votar, false);
});

test('una papeleta ya cerrada en la base sigue cerrada', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, estado: 'cerrada' }, AHORA);

  assert.equal(d.estado_efectivo, 'cerrada');
  assert.equal(d.motivo_no_disponible, 'La votación ha finalizado.');
});

// --- Todavía no abre --------------------------------------------------------

test('antes de la apertura el estado efectivo es pendiente', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_apertura: '2026-08-04 18:00:00' }, AHORA);

  assert.equal(d.estado_efectivo, 'pendiente');
  assert.equal(d.puede_votar, false);
  assert.equal(d.motivo_no_disponible, 'La votación todavía no ha abierto.');
});

test('pasada la hora de apertura la papeleta abre, aunque la columna diga pendiente', () => {
  // El fallo que esto cubre: NINGÚN camino del código escribía 'abierta'. La
  // papeleta se creaba 'pendiente' y ahí se quedaba, así que una votación
  // programada para las 18:00 no abría a las 18:00 ni nunca. La fecha manda,
  // igual que en el cierre; la tarea de apertura sincroniza la columna después.
  const d = disponibilidadDeVoto({ ...ABIERTA, estado: 'pendiente' }, AHORA);

  assert.equal(d.estado_efectivo, 'abierta');
  assert.equal(d.puede_votar, true);
  assert.equal(d.motivo_no_disponible, null);
});

test('una papeleta pendiente cuya hora aún no llega sigue pendiente', () => {
  const d = disponibilidadDeVoto(
    { ...ABIERTA, estado: 'pendiente', fecha_apertura: '2026-08-04 18:00:00' }, AHORA
  );

  assert.equal(d.estado_efectivo, 'pendiente');
  assert.equal(d.puede_votar, false);
});

test('justo en la hora de apertura la papeleta ya está abierta', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, estado: 'pendiente', fecha_apertura: AHORA }, AHORA);
  assert.equal(d.puede_votar, true);
});

test('un cierre manual gana sobre la fecha de apertura ya cumplida', () => {
  // Cerrar antes de tiempo debe seguir siendo posible: el estado 'cerrada' se
  // comprueba antes que la apertura por fecha.
  const d = disponibilidadDeVoto({ ...ABIERTA, estado: 'cerrada' }, AHORA);
  assert.equal(d.estado_efectivo, 'cerrada');
  assert.equal(d.puede_votar, false);
});

// --- Proceso cancelado o archivado ------------------------------------------

test('un proceso cancelado no admite votos y lo dice', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, estado_proceso: 'cancelado' }, AHORA);

  assert.equal(d.estado_efectivo, 'cerrada');
  assert.match(d.motivo_no_disponible!, /cancelado/i);
});

test('un proceso archivado es historial de solo lectura', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, archivado: 1 }, AHORA);

  assert.equal(d.estado_efectivo, 'cerrada');
  assert.match(d.motivo_no_disponible!, /archivado/i);
});

test('un proceso finalizado no admite votos aunque la papeleta siguiera abierta', () => {
  const d = disponibilidadDeVoto({ ...ABIERTA, estado_proceso: 'finalizado' }, AHORA);

  assert.equal(d.estado_efectivo, 'cerrada');
  assert.equal(d.puede_votar, false);
});

test('el motivo más definitivo gana: archivado por encima de "no ha abierto"', () => {
  const d = disponibilidadDeVoto(
    { ...ABIERTA, archivado: 1, fecha_apertura: '2099-01-01 00:00:00' }, AHORA
  );
  assert.match(d.motivo_no_disponible!, /archivado/i);
});

// --- Zona horaria -----------------------------------------------------------

test('la comparación se hace en hora de Ecuador, no en UTC', () => {
  // A las 02:00 UTC del día 5 en Ecuador son las 21:00 del día 4. Una votación
  // que cierra a las 23:00 del día 4 (hora de Ecuador) TODAVÍA está abierta;
  // comparar contra UTC la daría por cerrada.
  const instante = new Date('2026-08-05T02:00:00Z');
  const ahora = ahoraEnEcuador(instante);

  assert.equal(ahora, '2026-08-04 21:00:00', 'ahoraEnEcuador no está usando America/Guayaquil');
  assert.equal(ZONA_ECUADOR, 'America/Guayaquil');

  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_fin_votacion: '2026-08-04 23:00:00' }, ahora);
  assert.equal(d.puede_votar, true, 'se cerró cinco horas antes de tiempo');
});

test('con la misma hora, una votación que cerró a las 20:00 sí está vencida', () => {
  const ahora = ahoraEnEcuador(new Date('2026-08-05T02:00:00Z')); // 21:00 en Ecuador
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_fin_votacion: '2026-08-04 20:00:00' }, ahora);
  assert.equal(d.puede_votar, false);
});

test('acepta un Date además del texto, y lo interpreta en Ecuador', () => {
  // Por si alguna consulta no pasa por el pool con dateStrings.
  const fin = new Date('2026-08-04T12:00:00Z'); // 07:00 en Ecuador
  const d = disponibilidadDeVoto({ ...ABIERTA, fecha_fin_votacion: fin }, AHORA);
  assert.equal(d.puede_votar, false, 'un Date no se está normalizando a hora de Ecuador');
});

// --- Fechas ausentes --------------------------------------------------------

test('sin fecha de fin, la papeleta no vence sola', () => {
  const d = disponibilidadDeVoto(
    { ...ABIERTA, fecha_fin_votacion: null, fecha_cierre: null }, AHORA
  );
  assert.equal(d.puede_votar, true);
});
