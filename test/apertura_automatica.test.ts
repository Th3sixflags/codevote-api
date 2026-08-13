/**
 * Apertura automática de papeletas.
 *
 * El fallo que cubre: una votación programada para las 18:00 NO abría a las
 * 18:00. Ningún camino del código escribía nunca `votacion.estado = 'abierta'`
 * —la papeleta nacía 'pendiente' y ahí se quedaba—, así que:
 *
 *   - la papeleta no aceptaba votos nunca;
 *   - el cierre automático, que solo miraba papeletas 'abierta', tampoco la
 *     recogía, con lo que no se emitía su acta;
 *   - y sin acta ni papeletas cerradas, su proceso no podía finalizar.
 *
 * Ahora la apertura corre en la misma pasada que el cierre y antes que él.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import { abrirPapeletasProgramadas } from '../src/services/apertura_votacion.service.js';
import { estadoInicialDePapeleta } from '../src/services/votacion.service.js';
import { ahoraEnEcuador } from '../src/utils/zonaHoraria.js';

const PASADA   = '2020-01-01 08:00:00';  // ya ocurrió
const FUTURA   = '2099-12-31 23:59:59';  // aún no

interface Papeleta {
  id_votacion: number;
  titulo_papeleta: string;
  estado: string;
  id_proceso: number;
  fecha_apertura: string;
  fecha_cierre: string;
}

interface Proceso {
  id_proceso: number;
  nombre_proceso: string;
  estado: string;
  fecha_inicio_votacion: string;
  fecha_fin_votacion: string;
  archivado: boolean;
}

interface Estado {
  papeletas: Papeleta[];
  procesos: Proceso[];
  notificaciones: Array<{ cedula: string; titulo: string }>;
  sentencias: string[];
}

let estado: Estado;
const queryOriginal = (pool as any).query;

const procesoDe = (id: number) => estado.procesos.find((p) => p.id_proceso === id)!;
const papeleta  = (id = 1) => estado.papeletas.find((v) => v.id_votacion === id)!;

/** ¿El proceso cumple las condiciones para pasar a 'votacion'? (misma regla que el SQL) */
function puedeEntrarEnVotacion(p: Proceso, corte: string): boolean {
  if (!['planificado', 'convocado', 'inscripcion', 'campaña'].includes(p.estado)) return false;
  if (p.archivado) return false;
  if (!p.fecha_inicio_votacion || p.fecha_inicio_votacion > corte) return false;
  if (p.fecha_fin_votacion && p.fecha_fin_votacion <= corte) return false;
  return estado.papeletas.some((v) => v.id_proceso === p.id_proceso);
}

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
  estado.sentencias.push(sql);

  // Papeletas pendientes cuya hora de apertura ya pasó y siguen en plazo.
  if (sql.startsWith('SELECT v.id_votacion, v.titulo_papeleta, v.fk_id_carrera')) {
    const corte = params[0];
    return estado.papeletas
      .filter((v) => {
        const p = procesoDe(v.id_proceso);
        return v.estado === 'pendiente'
          && v.fecha_apertura <= corte
          && v.fecha_cierre > corte
          && p.fecha_fin_votacion > corte
          && !['cancelado', 'finalizado'].includes(p.estado)
          && !p.archivado;
      })
      .map((v) => ({
        id_votacion: v.id_votacion, titulo_papeleta: v.titulo_papeleta,
        fk_id_carrera: null, nombre_carrera: null,
        id_proceso: v.id_proceso, nombre_proceso: procesoDe(v.id_proceso).nombre_proceso,
        estado_proceso: procesoDe(v.id_proceso).estado,
        fecha_apertura: v.fecha_apertura, fecha_cierre: v.fecha_cierre,
      }));
  }

  // Apertura atómica: solo prospera si seguía pendiente.
  if (sql.startsWith("UPDATE votacion SET estado = 'abierta'")) {
    const v = estado.papeletas.find((x) => x.id_votacion === Number(params[0]));
    if (!v || v.estado !== 'pendiente') return { affectedRows: 0 };
    v.estado = 'abierta';
    return { affectedRows: 1 };
  }

  // Procesos cuya jornada ya empezó y siguen etiquetados en una etapa previa.
  if (sql.startsWith('SELECT p.id_proceso FROM proceso_electoral p')) {
    return estado.procesos
      .filter((p) => puedeEntrarEnVotacion(p, params[0]))
      .map((p) => ({ id_proceso: p.id_proceso }));
  }
  if (sql.startsWith("UPDATE proceso_electoral SET estado = 'votacion'")) {
    const p = procesoDe(Number(params[0]));
    if (!p || !puedeEntrarEnVotacion(p, params[1])) return { affectedRows: 0 };
    p.estado = 'votacion';
    return { affectedRows: 1 };
  }
  if (sql.startsWith('SELECT nombre_proceso FROM proceso_electoral')) {
    return [{ nombre_proceso: procesoDe(Number(params[0])).nombre_proceso }];
  }

  // Administración y avisos.
  if (sql.includes("rol = 'admin'")) {
    return [{ cedula: '1710000009', nombres: 'Steven', apellidos: 'Chininin', correo_institucional: 'admin@uide.edu.ec' }];
  }
  if (sql.startsWith('INSERT INTO notificacion')) {
    estado.notificaciones.push({ cedula: params[0], titulo: params[2] });
    return { insertId: estado.notificaciones.length };
  }

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(() => {
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
});

after(async () => {
  (pool as any).query = queryOriginal;
  await pool.end();
});

beforeEach(() => {
  estado = {
    procesos: [{
      id_proceso: 1, nombre_proceso: 'Elecciones 2026', estado: 'campaña',
      fecha_inicio_votacion: PASADA, fecha_fin_votacion: FUTURA, archivado: false,
    }],
    papeletas: [{
      id_votacion: 1, titulo_papeleta: 'Consejo', estado: 'pendiente', id_proceso: 1,
      fecha_apertura: PASADA, fecha_cierre: FUTURA,
    }],
    notificaciones: [], sentencias: [],
  };
});

// --- Lo que abre y lo que no ------------------------------------------------

test('una papeleta cuya hora de apertura ya pasó se abre sola', async () => {
  const abiertas = await abrirPapeletasProgramadas();

  assert.equal(papeleta().estado, 'abierta');
  assert.equal(abiertas.length, 1);
  assert.equal(abiertas[0].id_votacion, 1);
});

test('al crear una papeleta dos horas después de abrir, queda abierta sin esperar al cron', () => {
  const estadoInicial = estadoInicialDePapeleta({
    fk_id_proceso: 1,
    titulo_papeleta: 'Creada tarde',
    fecha_apertura: '2026-08-13 08:45:00',
    fecha_cierre: '2026-08-13 18:00:00',
  }, '2026-08-13 10:55:00');

  assert.equal(estadoInicial, 'abierta');
});

test('una papeleta cuya hora todavía no llega NO se abre', async () => {
  papeleta().fecha_apertura = FUTURA;

  const abiertas = await abrirPapeletasProgramadas();

  assert.deepEqual(abiertas, []);
  assert.equal(papeleta().estado, 'pendiente', 'se abrió una votación antes de tiempo');
});

test('una papeleta ya vencida no se abre: nunca llegó a estar abierta', async () => {
  // El servidor estuvo apagado toda su ventana. Abrirla ahora para cerrarla en
  // la misma pasada falsearía el historial; del cierre se encarga el cierre.
  papeleta().fecha_apertura = PASADA;
  papeleta().fecha_cierre   = '2020-01-02 18:00:00';
  procesoDe(1).fecha_fin_votacion = '2020-01-02 18:00:00';

  await abrirPapeletasProgramadas();

  assert.equal(papeleta().estado, 'pendiente');
});

test('una papeleta ya abierta no se vuelve a abrir ni se notifica dos veces', async () => {
  await abrirPapeletasProgramadas();
  const trasLaPrimera = estado.notificaciones.length;

  const segunda = await abrirPapeletasProgramadas();

  assert.deepEqual(segunda, [], 'la segunda pasada volvió a abrirla');
  assert.equal(estado.notificaciones.length, trasLaPrimera, 'se notificó dos veces');
});

test('un proceso cancelado no abre ninguna papeleta', async () => {
  procesoDe(1).estado = 'cancelado';

  await abrirPapeletasProgramadas();

  assert.equal(papeleta().estado, 'pendiente');
});

test('un proceso archivado no abre ninguna papeleta', async () => {
  procesoDe(1).archivado = true;

  await abrirPapeletasProgramadas();

  assert.equal(papeleta().estado, 'pendiente');
});

// --- Etapa del proceso ------------------------------------------------------

test('al abrir la jornada, el proceso pasa a votacion', async () => {
  await abrirPapeletasProgramadas();
  assert.equal(procesoDe(1).estado, 'votacion');
});

test('un proceso en escrutinio no retrocede a votacion', async () => {
  procesoDe(1).estado = 'escrutinio';

  await abrirPapeletasProgramadas();

  assert.equal(procesoDe(1).estado, 'escrutinio', 'el proceso retrocedió de etapa');
});

test('un proceso finalizado no retrocede a votacion', async () => {
  procesoDe(1).estado = 'finalizado';

  await abrirPapeletasProgramadas();

  assert.equal(procesoDe(1).estado, 'finalizado');
});

test('un proceso sin papeletas no entra en votacion', async () => {
  estado.papeletas = [];

  await abrirPapeletasProgramadas();

  assert.equal(procesoDe(1).estado, 'campaña');
});

// --- Zona horaria -----------------------------------------------------------

test('el corte viaja como parámetro y no se usa NOW()', async () => {
  await abrirPapeletasProgramadas();

  const consulta = estado.sentencias.find(
    (s) => s.startsWith('SELECT v.id_votacion, v.titulo_papeleta, v.fk_id_carrera')
  )!;
  assert.match(consulta, /v\.fecha_apertura <= \?/, 'el corte no viaja como parámetro');
  assert.ok(!/NOW\(\)/.test(consulta), 'usa NOW(), que depende de la zona de MySQL');
});

test('el corte tiene el formato de hora de Ecuador', async () => {
  const antes = ahoraEnEcuador();
  await abrirPapeletasProgramadas();

  assert.match(antes, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});
