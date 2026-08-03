/**
 * Cierre automático de papeletas.
 *
 * Una papeleta se cierra cuando su proceso pasa de `fecha_fin_votacion`. Al
 * cerrarse deja de aceptar votos, su escrutinio pasa a oficial, se emite el
 * acta (rastro de auditoría con solo cifras agregadas) y se avisa a la
 * administración una única vez.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import { ahoraEnEcuador, formatearEnEcuador } from '../src/utils/zonaHoraria.js';
import {
  cerrarPapeletasVencidas, cerrarPapeleta, componerCorreoDeCierre,
} from '../src/services/cierre_votacion.service.js';

interface Papeleta {
  id_votacion: number;
  titulo_papeleta: string;
  estado: string;
  fk_id_carrera: number | null;
  nombre_carrera: string | null;
  id_proceso: number;
  nombre_proceso: string;
  estado_proceso: string;
  fecha_fin_votacion: string | null;
}

let papeletas: Papeleta[];
let actas: number[];
let notificaciones: Array<{ cedula: string; titulo: string }>;

const queryOriginal = (pool as any).query;

/** Una fecha desplazada en minutos respecto de ahora, en hora de Ecuador. */
function enMinutos(minutos: number) {
  return ahoraEnEcuador(new Date(Date.now() + minutos * 60_000));
}

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();

  // Papeletas vencidas: se compara en hora de Ecuador, con el corte como parámetro.
  if (sql.includes('FROM votacion v') && sql.includes('p.fecha_fin_votacion <= ?')) {
    const corte = params[0];
    return papeletas.filter((p) =>
      p.estado === 'abierta'
      && p.fecha_fin_votacion != null
      && p.fecha_fin_votacion <= corte
      && p.estado_proceso !== 'cancelado');
  }
  // Cierre condicionado: solo prospera si sigue abierta (idempotencia).
  if (sql.startsWith("UPDATE votacion SET estado = 'cerrada'")) {
    const p = papeletas.find((x) => x.id_votacion === Number(params[0]));
    if (!p || p.estado !== 'abierta') return { affectedRows: 0 };
    p.estado = 'cerrada';
    return { affectedRows: 1 };
  }
  if (sql.startsWith('SELECT 1 FROM acta_resultados')) {
    return actas.includes(Number(params[0])) ? [{ 1: 1 }] : [];
  }
  if (sql.startsWith('INSERT INTO acta_resultados')) {
    actas.push(Number(params[0]));
    return { insertId: actas.length };
  }
  if (sql.includes("WHERE rol = 'admin'")) {
    return [
      { cedula: '1710000009', nombres: 'Steven', apellidos: 'Chininin', correo_institucional: 'schininin@uide.edu.ec' },
      { cedula: '1710000207', nombres: 'Carlos', apellidos: 'Admin', correo_institucional: 'cadmin@uide.edu.ec' },
    ];
  }
  // Conteo por opción y participación.
  if (sql.includes('FROM voto') && sql.includes('GROUP BY')) {
    return [
      { id_lista: 1, opcion: 'Innovación UIDE', total_votos: 7 },
      { id_lista: 2, opcion: 'Unidad Estudiantil', total_votos: 3 },
      { id_lista: null, opcion: 'blanco', total_votos: 1 },
      { id_lista: null, opcion: 'nulo', total_votos: 1 },
    ];
  }
  if (sql.includes('FROM codigo_voto') && sql.includes('COUNT')) return [{ total: 12 }];
  if (sql.startsWith('INSERT INTO notificacion')) {
    notificaciones.push({ cedula: params[0], titulo: params[2] });
    return { insertId: notificaciones.length };
  }

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

beforeEach(() => {
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
  actas = [];
  notificaciones = [];
  papeletas = [{
    id_votacion: 1,
    titulo_papeleta: 'Papeleta Consejo Estudiantil',
    estado: 'abierta',
    fk_id_carrera: null,
    nombre_carrera: null,
    id_proceso: 1,
    nombre_proceso: 'Elecciones Consejo 2026',
    estado_proceso: 'votacion',
    fecha_fin_votacion: enMinutos(-5), // venció hace 5 minutos
  }];
});

after(async () => {
  (pool as any).query = queryOriginal;
  await pool.end();
});

// --- Antes y después de la hora --------------------------------------------

test('antes de la hora la papeleta sigue abierta', async () => {
  papeletas[0].fecha_fin_votacion = enMinutos(30); // aún falta media hora

  const cerradas = await cerrarPapeletasVencidas();

  assert.deepEqual(cerradas, []);
  assert.equal(papeletas[0].estado, 'abierta');
  assert.deepEqual(actas, [], 'no debe emitirse acta antes de tiempo');
  assert.deepEqual(notificaciones, [], 'tampoco debe avisarse a nadie');
});

test('al vencer, la papeleta se cierra', async () => {
  const cerradas = await cerrarPapeletasVencidas();

  assert.equal(cerradas.length, 1);
  assert.equal(papeletas[0].estado, 'cerrada');
  assert.equal(cerradas[0].participacion, 12);
});

test('una papeleta de un proceso cancelado no se cierra por vencimiento', async () => {
  papeletas[0].estado_proceso = 'cancelado';

  const cerradas = await cerrarPapeletasVencidas();

  assert.deepEqual(cerradas, []);
  assert.equal(papeletas[0].estado, 'abierta');
});

// --- Escrutinio y auditoría -------------------------------------------------

test('el cierre emite el acta con las cifras agregadas', async () => {
  await cerrarPapeletasVencidas();
  assert.deepEqual(actas, [1], 'debe emitirse un acta para la papeleta 1');
});

test('el acta no relaciona a ningún votante con su voto', async () => {
  // El acta guarda totales y la lista ganadora; ninguna cédula la acompaña.
  const sentencias: string[] = [];
  (pool as any).query = async (sql: string, params: any[] = []) => {
    sentencias.push(sql.replace(/\s+/g, ' ').trim());
    return [ejecutar(sql, params), []];
  };

  await cerrarPapeletasVencidas();

  const insertActa = sentencias.find((s) => s.startsWith('INSERT INTO acta_resultados'))!;
  assert.ok(insertActa, 'no se emitió el acta');
  assert.ok(!/cedula/i.test(insertActa), 'el acta no debe incluir cédulas');
});

// --- Avisos: uno solo -------------------------------------------------------

test('se avisa a cada admin una sola vez y el envío se intenta una vez', async () => {
  const cerradas = await cerrarPapeletasVencidas();

  assert.equal(notificaciones.length, 2, 'una notificación por admin activo');
  assert.deepEqual(notificaciones.map((n) => n.titulo), ['Votación cerrada', 'Votación cerrada']);
  // Sin SMTP configurado el envío devuelve false, pero se intentó una sola vez.
  assert.equal(cerradas[0].correoEnviado, false);
});

test('el correo trae proceso, papeleta, hora, participación y enlace', () => {
  const { asunto, texto, para } = componerCorreoDeCierre({
    titulo_papeleta: 'Papeleta Consejo Estudiantil',
    nombre_proceso: 'Elecciones Consejo 2026',
    momento: '2026-08-03 17:05:00',
    participacion: 12,
    destinatarios: ['schininin@uide.edu.ec', 'cadmin@uide.edu.ec'],
  });

  assert.deepEqual(para, ['schininin@uide.edu.ec', 'cadmin@uide.edu.ec'], 'un solo correo a los dos admins');
  assert.match(asunto, /Papeleta Consejo Estudiantil/);
  assert.match(texto, /Elecciones Consejo 2026/);
  assert.match(texto, /03\/08\/2026, 17:05 \(hora de Ecuador\)/);
  assert.match(texto, /Participación:\s+12 personas/);
  assert.match(texto, /https:\/\/codevote\.lat\/admin\/resultados/);
  assert.match(texto, /oficiales ya están disponibles/i);
});

test('con una sola persona el correo dice "persona", no "personas"', () => {
  const { texto } = componerCorreoDeCierre({
    titulo_papeleta: 'X', nombre_proceso: 'Y', momento: '2026-08-03 17:05:00',
    participacion: 1, destinatarios: ['a@uide.edu.ec'],
  });
  assert.match(texto, /Participación:\s+1 persona$/m);
});

// --- Idempotencia -----------------------------------------------------------

test('una segunda pasada no vuelve a procesar la papeleta ya cerrada', async () => {
  await cerrarPapeletasVencidas();
  const trasLaPrimera = { actas: [...actas], notificaciones: notificaciones.length };

  const segunda = await cerrarPapeletasVencidas();

  assert.deepEqual(segunda, [], 'la segunda pasada no cierra nada');
  assert.deepEqual(actas, trasLaPrimera.actas, 'no debe emitirse una segunda acta');
  assert.equal(notificaciones.length, trasLaPrimera.notificaciones,
    'no deben duplicarse los avisos (ni la notificación ni el correo, que van juntos)');
});

test('cerrar directamente una papeleta ya cerrada no repite nada', async () => {
  papeletas[0].estado = 'cerrada';

  const resultado = await cerrarPapeleta({
    id_votacion: 1,
    titulo_papeleta: 'Papeleta Consejo Estudiantil',
    nombre_proceso: 'Elecciones Consejo 2026',
  });

  assert.equal(resultado, null);
  assert.deepEqual(actas, []);
  assert.deepEqual(notificaciones, []);
});

// --- Reconciliación al reiniciar --------------------------------------------

test('si venció con el servidor apagado, la primera pasada al arrancar la cierra', async () => {
  // Vencida hace dos horas: nadie la cerró porque el backend estaba caído.
  papeletas[0].fecha_fin_votacion = enMinutos(-120);

  const cerradas = await cerrarPapeletasVencidas();

  assert.equal(cerradas.length, 1);
  assert.equal(papeletas[0].estado, 'cerrada');
  assert.deepEqual(actas, [1]);
  assert.equal(notificaciones.length, 2, 'se avisa a la administración al reconciliar');
});

// --- Zona horaria de Ecuador ------------------------------------------------

test('el corte se calcula en hora de Ecuador, no en la del contenedor', () => {
  // 02:30 UTC son las 21:30 del día anterior en Ecuador (UTC-5).
  assert.equal(ahoraEnEcuador(new Date('2026-08-03T02:30:00Z')), '2026-08-02 21:30:00');
  // Mediodía UTC son las 07:00 en Ecuador.
  assert.equal(ahoraEnEcuador(new Date('2026-08-03T12:00:00Z')), '2026-08-03 07:00:00');
  // Formato exacto que MySQL compara contra un DATETIME.
  assert.match(ahoraEnEcuador(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('Ecuador no aplica horario de verano: el desfase es el mismo en enero y en julio', () => {
  assert.equal(ahoraEnEcuador(new Date('2026-01-15T18:00:00Z')), '2026-01-15 13:00:00');
  assert.equal(ahoraEnEcuador(new Date('2026-07-15T18:00:00Z')), '2026-07-15 13:00:00');
});

test('la hora del aviso se muestra en formato de Ecuador', () => {
  assert.equal(formatearEnEcuador('2026-08-03 17:05:00'), '03/08/2026, 17:05');
});

test('una papeleta que vence justo ahora entra en el corte', async () => {
  papeletas[0].fecha_fin_votacion = ahoraEnEcuador();

  const cerradas = await cerrarPapeletasVencidas();

  assert.equal(cerradas.length, 1, 'el corte es <=, así que el instante exacto cuenta');
});
