/**
 * Recordatorios por correo del calendario electoral y faltas por no votar.
 *
 * Lo que se comprueba es lo que hace estos avisos seguros de operar:
 *   - cada aviso sale UNA sola vez, aunque la tarea corra cada minuto;
 *   - la reserva ocurre ANTES de enviar, así dos pasadas simultáneas no
 *     duplican un correo a todo el padrón;
 *   - se manda un mensaje POR PERSONA, nunca uno con todo el padrón en el
 *     "para" (eso publicaría la lista de correos institucionales);
 *   - la última llamada y las faltas se calculan sobre `codigo_voto`, que
 *     prueba la participación sin revelar la opción: el anonimato del voto no
 *     se toca;
 *   - los destinatarios son exactamente el padrón de la papeleta.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.URL_APP = 'https://codevote.lat';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import * as avisos from '../src/services/avisos_electorales.service.js';
import type { PapeletaParaAviso } from '../src/repositories/aviso_electoral.repository.js';

const PAPELETA: PapeletaParaAviso = {
  id_votacion: 4,
  titulo_papeleta: 'Consejo Estudiantil',
  fecha_apertura: '2026-08-10 08:00:00',
  fecha_cierre: '2026-08-10 18:00:00',
  estado: 'abierta',
  carrera_votacion: null,
  nombre_carrera: null,
  id_proceso: 7,
  nombre_proceso: 'Elecciones 2026',
  tipo_proceso: 'consejo_estudiantil',
  descripcion: 'Renovación del Consejo Estudiantil para el periodo 2026-2027.',
  estado_proceso: 'votacion',
};

const PADRON = [
  { cedula: '1105946139', nombres: 'Ana',    apellidos: 'Carpio', correo_institucional: 'ana@uide.edu.ec' },
  { cedula: '1710000017', nombres: 'María',  apellidos: 'Gómez',  correo_institucional: 'maria@uide.edu.ec' },
  { cedula: '1710000025', nombres: 'Carlos', apellidos: 'Pérez',  correo_institucional: 'carlos@uide.edu.ec' },
];

interface Estado {
  /** Avisos ya reservados: "votacionId:tipo". */
  reservados: Set<string>;
  padron: typeof PADRON;
  sanciones: Array<{ cedula: string; votacion: number; motivo: string }>;
  notificaciones: string[];
  sentencias: string[];
  /** Un elemento por sendMail: así se ve si fue uno por persona o uno a todos. */
  correos: Array<{ para: string[]; asunto: string }>;
}

let estado: Estado;
const queryOriginal = (pool as any).query;
const sendMailOriginal = process.env.SMTP_HOST;

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
  estado.sentencias.push(sql);

  if (sql.startsWith('INSERT INTO aviso_papeleta')) {
    const clave = `${params[0]}:${params[1]}`;
    if (estado.reservados.has(clave)) {
      const err: any = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY'; err.errno = 1062;
      throw err;
    }
    estado.reservados.add(clave);
    return { insertId: estado.reservados.size };
  }
  if (sql.startsWith('UPDATE aviso_papeleta')) return { affectedRows: 1 };
  if (sql.includes('FROM estudiante e') && sql.includes("e.rol IN ('estudiante', 'candidato')")) {
    return estado.padron;
  }
  if (sql.startsWith('INSERT IGNORE INTO sancion_electoral')) {
    for (let i = 0; i < params.length; i += 3) {
      const [cedula, votacion, motivo] = params.slice(i, i + 3);
      if (!estado.sanciones.some((s) => s.cedula === cedula && s.votacion === Number(votacion))) {
        estado.sanciones.push({ cedula, votacion: Number(votacion), motivo });
      }
    }
    return { affectedRows: params.length / 3 };
  }
  if (sql.startsWith('UPDATE sancion_electoral')) return { affectedRows: 1 };
  if (sql.startsWith('INSERT INTO notificacion')) {
    estado.notificaciones.push(params[0]);
    return { insertId: 1 };
  }
  if (sql.includes('FROM votacion v') && sql.includes('v.id_votacion = ?')) {
    return [PAPELETA];
  }

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(() => {
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
});

after(async () => {
  (pool as any).query = queryOriginal;
  if (sendMailOriginal === undefined) delete process.env.SMTP_HOST;
  await pool.end();
});

beforeEach(() => {
  estado = {
    reservados: new Set(), padron: PADRON, sanciones: [],
    notificaciones: [], sentencias: [], correos: [],
  };
});

// --- Plantillas -------------------------------------------------------------

test('la convocatoria lleva proceso, fechas, de qué trata y el enlace', () => {
  const { asunto, texto, html } = avisos.componerConvocatoria(PAPELETA);

  assert.match(asunto, /Elecciones 2026/);
  assert.match(texto, /Consejo Estudiantil/);
  assert.match(texto, /Renovación del Consejo Estudiantil/);
  assert.match(texto, /10\/08\/2026,? 08:00/, 'falta la fecha de apertura');
  assert.match(texto, /10\/08\/2026,? 18:00/, 'falta la fecha de cierre');
  assert.match(texto, /https:\/\/codevote\.lat\/votacion\/4/);
  assert.match(html, /https:\/\/codevote\.lat\/votacion\/4/);
});

test('la papeleta de carrera lo dice en el correo', () => {
  const { texto } = avisos.componerConvocatoria({
    ...PAPELETA, carrera_votacion: 3, nombre_carrera: 'Tecnologías de la Información',
  });
  assert.match(texto, /Tecnolog[íi]as de la Informaci[óo]n/);
});

test('la apertura invita a votar y recuerda que el voto es secreto', () => {
  const { asunto, texto } = avisos.componerApertura(PAPELETA);

  assert.match(asunto, /Ya puedes votar/i);
  assert.match(texto, /10\/08\/2026,? 18:00/);
  assert.match(texto, /secreto/i);
  assert.match(texto, /https:\/\/codevote\.lat\/votacion\/4/);
});

test('la última llamada dice cuánto queda y que no votar es una falta', () => {
  const { asunto, texto } = avisos.componerCierreProximo(PAPELETA, 2);

  assert.match(asunto, /[ÚU]ltima llamada/i);
  assert.match(texto, /menos de 2 horas/);
  assert.match(texto, /falta/i);
});

test('el correo de falta explica cómo justificarla', () => {
  const { asunto, texto } = avisos.componerSancion(PAPELETA);

  assert.match(asunto, /No registramos tu voto/i);
  assert.match(texto, /falta/i);
  assert.match(texto, /justificaci[óo]n/i);
  assert.match(texto, /https:\/\/codevote\.lat\/perfil/);
});

test('el enlace de la papeleta es el que se imprime como QR', () => {
  assert.equal(avisos.enlaceDePapeleta(12), 'https://codevote.lat/votacion/12');
  assert.equal(avisos.enlaceDeElecciones(), 'https://codevote.lat/elecciones');
});

// --- Un aviso, una sola vez -------------------------------------------------

test('la apertura se avisa una vez, aunque la tarea pase muchas veces', async () => {
  const primera = await avisos.avisarApertura(PAPELETA);
  assert.ok(primera, 'no se envió el primer aviso');
  assert.equal(primera.destinatarios, 3);

  for (let i = 0; i < 5; i += 1) {
    assert.equal(await avisos.avisarApertura(PAPELETA), null, 'se reenvió el aviso');
  }
});

test('la reserva ocurre ANTES de consultar el padrón y enviar', async () => {
  await avisos.avisarApertura(PAPELETA);

  const iReserva = estado.sentencias.findIndex((s) => s.startsWith('INSERT INTO aviso_papeleta'));
  const iPadron  = estado.sentencias.findIndex((s) => s.includes('FROM estudiante e'));

  assert.ok(iReserva >= 0 && iPadron >= 0);
  assert.ok(iReserva < iPadron, 'se consultó el padrón antes de reservar el aviso');
});

test('dos pasadas simultáneas solo envían un aviso', async () => {
  const [a, b] = await Promise.all([
    avisos.avisarApertura(PAPELETA),
    avisos.avisarApertura(PAPELETA),
  ]);

  assert.equal([a, b].filter(Boolean).length, 1, 'el aviso salió dos veces');
});

test('cada tipo de aviso es independiente', async () => {
  assert.ok(await avisos.avisarApertura(PAPELETA));
  assert.ok(await avisos.avisarCierreProximo(PAPELETA, 24));
  assert.ok(await avisos.sancionarAusentes(PAPELETA));
});

// --- Destinatarios y anonimato ----------------------------------------------

test('la última llamada solo va a quienes no han votado', async () => {
  await avisos.avisarCierreProximo(PAPELETA, 24);

  const consulta = estado.sentencias.find((s) => s.includes('FROM estudiante e'))!;
  assert.match(consulta, /NOT EXISTS/, 'no filtra a quienes ya votaron');
  assert.match(consulta, /FROM codigo_voto/, 'no se apoya en el comprobante');
  assert.ok(!consulta.includes('FROM voto '), 'consultó la tabla anónima de votos');
});

test('la apertura va a todo el padrón, hayan votado o no', async () => {
  await avisos.avisarApertura(PAPELETA);

  const consulta = estado.sentencias.find((s) => s.includes('FROM estudiante e'))!;
  assert.ok(!consulta.includes('NOT EXISTS'), 'la apertura excluyó a alguien del padrón');
});

test('el padrón es el mismo que puede votar: activos, estudiantes y candidatos', async () => {
  await avisos.avisarApertura(PAPELETA);

  const consulta = estado.sentencias.find((s) => s.includes('FROM estudiante e'))!;
  assert.match(consulta, /e\.estado_academico = 'activo'/);
  assert.match(consulta, /e\.rol IN \('estudiante', 'candidato'\)/);
  assert.match(consulta, /e\.fk_id_carrera = \?/, 'no segmenta por carrera');
});

test('ningún aviso consulta la tabla anónima de votos', async () => {
  await avisos.avisarApertura(PAPELETA);
  await avisos.avisarCierreProximo(PAPELETA, 24);
  await avisos.sancionarAusentes(PAPELETA);

  for (const sql of estado.sentencias) {
    assert.ok(!/\bFROM voto\b/.test(sql), `una consulta leyó la tabla voto: ${sql.slice(0, 80)}`);
  }
});

// --- Sanciones ---------------------------------------------------------------

test('al cerrar se registra una falta por cada ausente', async () => {
  const resultado = await avisos.sancionarAusentes(PAPELETA);

  assert.equal(resultado?.destinatarios, 3);
  assert.equal(estado.sanciones.length, 3);
  assert.deepEqual(
    estado.sanciones.map((s) => s.cedula).sort(),
    PADRON.map((p) => p.cedula).sort()
  );
  assert.match(estado.sanciones[0].motivo, /Consejo Estudiantil/);
});

test('sin ausentes no se registra ninguna falta', async () => {
  estado.padron = [];

  const resultado = await avisos.sancionarAusentes(PAPELETA);

  assert.equal(resultado?.destinatarios, 0);
  assert.equal(estado.sanciones.length, 0);
});

test('reprocesar el cierre no duplica las faltas', async () => {
  await avisos.sancionarAusentes(PAPELETA);
  // La reserva ya está tomada, así que la segunda llamada no hace nada.
  assert.equal(await avisos.sancionarAusentes(PAPELETA), null);
  assert.equal(estado.sanciones.length, 3);
});

test('la falta también llega a la campanita de la aplicación', async () => {
  await avisos.sancionarAusentes(PAPELETA);
  assert.equal(estado.notificaciones.length, 3);
});

// --- Privacidad del envío ----------------------------------------------------

test('se envía un correo por persona, no uno con todo el padrón en el "para"', () => {
  // Mandar un solo correo con los tres en el "para" publicaría la lista completa
  // de correos institucionales a cada destinatario. `enviarATodos` arma un envío
  // por persona; se comprueba sobre el código, insensible a espacios, porque el
  // fallo sería silencioso: el correo saldría igual y nadie lo notaría.
  const fuente = avisos.enviarATodos.toString().replace(/\s+/g, '');

  assert.match(fuente, /para:\[d\.correo_institucional\]/, 'el envío no es individual');
  assert.ok(!/para:destinatarios/.test(fuente), 'se pasó el padrón completo a un solo correo');
  assert.ok(!/para:\w+\.map/.test(fuente), 'se pasó una lista de correos a un solo envío');
});
