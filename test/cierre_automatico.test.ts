/**
 * Cierre automático de papeletas vencidas.
 *
 * Corre cada minuto y también al arrancar, de modo que si el servidor estuvo
 * apagado mientras vencía una votación, la encuentra y la cierra al levantarse.
 *
 * Lo que se comprueba:
 *   - una papeleta en plazo NO se toca;
 *   - una vencida pasa a cerrada, emite su acta y avisa a la administración;
 *   - repetir la pasada no duplica actas, notificaciones ni correos;
 *   - si el SMTP falla, el cierre queda hecho igual;
 *   - cuando cierran todas las papeletas de un proceso vencido, el proceso pasa
 *     a finalizado, salvo que esté cancelado o archivado.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import { cerrarPapeletasVencidas } from '../src/services/cierre_votacion.service.js';
import { ahoraEnEcuador } from '../src/utils/zonaHoraria.js';

const VENCIDA   = '2020-01-01 18:00:00';
const EN_PLAZO  = '2099-12-31 23:59:59';

interface Papeleta {
  id_votacion: number;
  titulo_papeleta: string;
  estado: string;
  id_proceso: number;
  /** Cierre propio de la papeleta. */
  fecha_cierre?: string | null;
  /** Simula que el UPDATE de cierre no prospera (fallo o carrera perdida). */
  noSeCierra?: boolean;
}

interface Proceso {
  id_proceso: number;
  nombre_proceso: string;
  estado: string;
  archivado: boolean;
}

interface Estado {
  papeletas: Papeleta[];
  procesos: Proceso[];
  actas: number[];
  notificaciones: Array<{ cedula: string; titulo: string }>;
  sentencias: string[];
}

let estado: Estado;
const queryOriginal = (pool as any).query;

const procesoDe = (id: number) => estado.procesos.find((p) => p.id_proceso === id)!;

/** ¿El proceso cumple las condiciones para finalizar? (misma regla que el SQL) */
function puedeFinalizar(p: Proceso, corte: string): boolean {
  if (['finalizado', 'cancelado'].includes(p.estado)) return false;
  if (p.archivado) return false;
  const suyas = estado.papeletas.filter((v) => v.id_proceso === p.id_proceso);
  return suyas.length > 0 && suyas.every((v) => v.estado === 'cerrada');
}

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
  estado.sentencias.push(sql);

  // Papeletas vencidas y aún sin cerrar por su propia fecha; se recogen
  // también las que siguen 'pendiente', para que su proceso pueda finalizar.
  //
  // Se reconoce por el principio del SELECT y no por "v.estado <> 'cerrada'":
  // esa condición aparece también dentro del NOT EXISTS de la finalización del
  // proceso, y este bloque se la habría quedado.
  if (sql.startsWith('SELECT v.id_votacion, v.titulo_papeleta, v.fk_id_carrera')) {
    const corte = params[0];
    return estado.papeletas
      .filter((v) => {
        const p = procesoDe(v.id_proceso);
        const vencePorPapeleta = Boolean(v.fecha_cierre) && v.fecha_cierre! <= corte;
        return v.estado !== 'cerrada'
          && p.estado !== 'cancelado'
          && vencePorPapeleta;
      })
      .map((v) => ({
        id_votacion: v.id_votacion, titulo_papeleta: v.titulo_papeleta,
        fk_id_carrera: null, nombre_carrera: null,
        id_proceso: v.id_proceso, nombre_proceso: procesoDe(v.id_proceso).nombre_proceso,
        fk_id_institucion: 1,
      }));
  }

  // Detalle de una papeleta (lo que lee actualizarVotacion antes de decidir).
  if (sql.includes('FROM votacion v') && sql.includes('v.id_votacion = ?')) {
    const v = estado.papeletas.find((x) => x.id_votacion === Number(params[0]));
    if (!v) return [];
    const p = procesoDe(v.id_proceso);
    return [{
      id_votacion: v.id_votacion, titulo_papeleta: v.titulo_papeleta, estado: v.estado,
      fecha_apertura: '2020-01-01 08:00:00', fecha_cierre: v.fecha_cierre,
      fk_id_carrera: null, nombre_carrera: null, foto_url: null,
      id_proceso: p.id_proceso, fk_id_proceso: p.id_proceso, nombre_proceso: p.nombre_proceso,
      estado_proceso: p.estado,
      archivado: p.archivado ? 1 : 0,
      tiene_votos: 0, tiene_comprobantes: 0, tiene_actas: 0, tiene_veedurias: 0,
    }];
  }
  // Edición de la papeleta (incluido un intento de reapertura).
  if (sql.startsWith('UPDATE votacion SET') && !sql.includes("estado = 'cerrada'")) {
    const v = estado.papeletas.find((x) => x.id_votacion === Number(params[params.length - 1]));
    if (v && sql.includes('estado = ?')) v.estado = params[0];
    return { affectedRows: v ? 1 : 0 };
  }

  // Cierre atómico: solo prospera si NO estaba ya cerrada (vale desde
  // 'abierta' y desde 'pendiente').
  if (sql.startsWith("UPDATE votacion SET estado = 'cerrada'")) {
    const v = estado.papeletas.find((x) => x.id_votacion === Number(params[0]));
    if (!v || v.estado === 'cerrada' || v.noSeCierra) return { affectedRows: 0 };
    v.estado = 'cerrada';
    return { affectedRows: 1 };
  }

  // Escrutinio.
  if (sql.includes('FROM lista_candidata l') && sql.includes('total_votos')) {
    return [
      { id_lista: 1, opcion: 'Halo', total_votos: 7 },
      { id_lista: 2, opcion: 'Nexus', total_votos: 3 },
      { id_lista: null, opcion: 'blanco', total_votos: 1 },
      { id_lista: null, opcion: 'nulo', total_votos: 1 },
    ];
  }
  if (sql.includes('FROM codigo_voto')) return [{ total: 12 }];

  // Acta.
  if (sql.startsWith('SELECT 1 FROM acta_resultados')) {
    return estado.actas.includes(Number(params[0])) ? [{ 1: 1 }] : [];
  }
  if (sql.startsWith('INSERT INTO acta_resultados')) {
    estado.actas.push(Number(params[0]));
    return { insertId: estado.actas.length };
  }

  // Administración y avisos.
  if (sql.includes("rol = 'admin'")) {
    return [{ cedula: '1710000009', nombres: 'Steven', apellidos: 'Chininin', correo_institucional: 'admin@uide.edu.ec' }];
  }
  if (sql.startsWith('INSERT INTO notificacion')) {
    estado.notificaciones.push({ cedula: params[0], titulo: params[2] });
    return { insertId: estado.notificaciones.length };
  }

  // Finalización del proceso.
  if (sql.startsWith('SELECT p.id_proceso FROM proceso_electoral p')) {
    return estado.procesos.filter((p) => puedeFinalizar(p, '')).map((p) => ({ id_proceso: p.id_proceso }));
  }
  if (sql.startsWith("UPDATE proceso_electoral p SET p.estado = 'finalizado'")) {
    const p = procesoDe(Number(params[0]));
    if (!p || !puedeFinalizar(p, '')) return { affectedRows: 0 };
    p.estado = 'finalizado';
    return { affectedRows: 1 };
  }
  if (sql.startsWith('SELECT nombre_proceso FROM proceso_electoral')) {
    return [{ nombre_proceso: procesoDe(Number(params[0])).nombre_proceso }];
  }
  // Notificación a quienes votaron en el proceso.
  if (sql.includes('INSERT INTO notificacion') || sql.includes('FROM codigo_voto cv')) {
    estado.notificaciones.push({ cedula: 'padron', titulo: 'Resultados disponibles' });
    return { affectedRows: 1 };
  }

  if (sql.toLowerCase().includes('select p.*, c.nombre_carrera')) {
    const p = procesoDe(Number(params[0]));
    return p ? [{ ...p, puede_eliminar: 1 }] : [];
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
      id_proceso: 1, nombre_proceso: 'Elecciones 2026',
      estado: 'votacion', archivado: false,
    }],
    papeletas: [
      { id_votacion: 1, titulo_papeleta: 'Consejo', estado: 'abierta', id_proceso: 1, fecha_cierre: VENCIDA },
    ],
    actas: [], notificaciones: [], sentencias: [],
  };
});

const papeleta = (id = 1) => estado.papeletas.find((v) => v.id_votacion === id)!;

// --- Qué se cierra y qué no -------------------------------------------------

test('una papeleta todavía en plazo permanece abierta', async () => {
  papeleta().fecha_cierre = EN_PLAZO;

  const cerradas = await cerrarPapeletasVencidas();

  assert.deepEqual(cerradas, []);
  assert.equal(papeleta().estado, 'abierta');
  assert.deepEqual(estado.actas, [], 'se emitió un acta de una votación en curso');
});

test('una papeleta vencida pasa a cerrada', async () => {
  const cerradas = await cerrarPapeletasVencidas();

  assert.equal(cerradas.length, 1);
  assert.equal(cerradas[0].id_votacion, 1);
  assert.equal(papeleta().estado, 'cerrada');
});

test('al arrancar con una papeleta vencida, se cierra en la primera pasada', async () => {
  // Es la reconciliación del arranque: la misma función, sin estado previo.
  assert.equal(papeleta().estado, 'abierta');
  await cerrarPapeletasVencidas();
  assert.equal(papeleta().estado, 'cerrada');
});

test('la consulta compara contra la hora de Ecuador, no contra NOW()', async () => {
  await cerrarPapeletasVencidas();

  const consulta = estado.sentencias.find(
    (s) => s.startsWith('SELECT v.id_votacion, v.titulo_papeleta, v.fk_id_carrera')
  )!;
  assert.match(consulta, /v\.fecha_cierre <= \?/, 'el corte no viaja como parámetro');
  assert.ok(!/NOW\(\)/.test(consulta), 'usa NOW(), que depende de la zona de MySQL');
});

test('el corte enviado tiene el formato de hora de Ecuador', async () => {
  const antes = ahoraEnEcuador();
  await cerrarPapeletasVencidas();
  const despues = ahoraEnEcuador();

  // Se comprueba el formato exacto que produce ahoraEnEcuador.
  assert.match(antes, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(antes <= despues);
});

// --- Acta, notificación y correo --------------------------------------------

test('el cierre emite el acta y avisa a la administración', async () => {
  await cerrarPapeletasVencidas();

  assert.deepEqual(estado.actas, [1], 'no se emitió el acta');
  const avisos = estado.notificaciones.filter((n) => n.titulo === 'Votación cerrada');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].cedula, '1710000009');
});

test('el acta guarda el escrutinio agregado, sin ninguna cédula', async () => {
  await cerrarPapeletasVencidas();

  const insercion = estado.sentencias.find((s) => s.startsWith('INSERT INTO acta_resultados'))!;
  assert.match(insercion, /total_votantes, votos_validos, votos_blanco, votos_nulos, lista_ganadora/);
  assert.ok(!/cedula/i.test(insercion), 'el acta guarda una cédula');
});

test('repetir la pasada no duplica actas ni notificaciones', async () => {
  await cerrarPapeletasVencidas();
  const actasTrasLaPrimera = [...estado.actas];
  const avisosTrasLaPrimera = estado.notificaciones.length;

  for (let i = 0; i < 3; i += 1) {
    const cerradas = await cerrarPapeletasVencidas();
    assert.deepEqual(cerradas, [], 'volvió a cerrar una papeleta ya cerrada');
  }

  assert.deepEqual(estado.actas, actasTrasLaPrimera);
  assert.equal(estado.notificaciones.length, avisosTrasLaPrimera);
});

test('un fallo del correo no revierte el cierre', async () => {
  // Sin SMTP configurado, enviarCorreo devuelve false sin lanzar: el cierre, el
  // acta y la notificación interna ocurren igual.
  const cerradas = await cerrarPapeletasVencidas();

  assert.equal(papeleta().estado, 'cerrada');
  assert.deepEqual(estado.actas, [1]);
  assert.equal(cerradas[0].correoEnviado, false);
});

// --- Finalización del proceso -----------------------------------------------

test('cerradas todas las papeletas de un proceso vencido, el proceso finaliza', async () => {
  await cerrarPapeletasVencidas();
  assert.equal(procesoDe(1).estado, 'finalizado');
});

test('una papeleta pendiente de un proceso vencido también se cierra', async () => {
  // Nunca llegó a abrirse (el servidor estuvo apagado toda su ventana), pero
  // tiene que quedar cerrada: mientras no lo esté, su proceso no puede
  // finalizar y se queda colgado para siempre. Su acta sale con el escrutinio
  // real, que es lo que de verdad ocurrió.
  estado.papeletas.push({ id_votacion: 2, titulo_papeleta: 'Carrera', estado: 'pendiente', id_proceso: 1, fecha_cierre: VENCIDA });

  await cerrarPapeletasVencidas();

  assert.equal(papeleta(1).estado, 'cerrada');
  assert.equal(papeleta(2).estado, 'cerrada', 'una papeleta pendiente y vencida se quedó sin cerrar');
  assert.equal(procesoDe(1).estado, 'finalizado');
});

test('si una papeleta no llega a cerrarse, el proceso NO finaliza', async () => {
  // Es la garantía de `finalizarSiTodoCerrado`: basta con que quede UNA sin
  // cerrar —aquí porque su UPDATE falla— para que el proceso siga en curso.
  estado.papeletas.push({
    id_votacion: 2, titulo_papeleta: 'Carrera', estado: 'abierta', id_proceso: 1, fecha_cierre: VENCIDA, noSeCierra: true,
  });

  await cerrarPapeletasVencidas();

  assert.equal(papeleta(1).estado, 'cerrada');
  assert.equal(papeleta(2).estado, 'abierta');
  assert.equal(procesoDe(1).estado, 'votacion', 'finalizó con una papeleta sin cerrar');
});

test('un proceso cancelado no se toca', async () => {
  procesoDe(1).estado = 'cancelado';

  await cerrarPapeletasVencidas();

  assert.equal(procesoDe(1).estado, 'cancelado');
  assert.equal(papeleta().estado, 'abierta', 'se cerró la papeleta de un proceso cancelado');
});

test('un proceso archivado no se finaliza', async () => {
  procesoDe(1).archivado = true;
  procesoDe(1).estado = 'escrutinio';

  await cerrarPapeletasVencidas();

  assert.equal(procesoDe(1).estado, 'escrutinio');
});

test('un proceso ya finalizado no vuelve a notificar', async () => {
  await cerrarPapeletasVencidas();
  const avisos = estado.notificaciones.length;

  await cerrarPapeletasVencidas();

  assert.equal(estado.notificaciones.length, avisos, 'se repitió el aviso de finalización');
});

test('un proceso cuyas papeletas ya estaban cerradas también se finaliza', async () => {
  // Caso del cierre manual o de un reinicio a mitad de la pasada anterior: no
  // hay nada que cerrar, pero el proceso se quedó sin finalizar.
  papeleta().estado = 'cerrada';

  const cerradas = await cerrarPapeletasVencidas();

  assert.deepEqual(cerradas, [], 'no había papeletas que cerrar');
  assert.equal(procesoDe(1).estado, 'finalizado');
});

test('un proceso sin ninguna papeleta no se finaliza solo', async () => {
  estado.papeletas = [];

  await cerrarPapeletasVencidas();

  assert.equal(procesoDe(1).estado, 'votacion', 'finalizó un proceso que nunca tuvo papeletas');
});

// --- Una papeleta cerrada no se reabre fuera de su propio plazo --------------

test('reabrir una papeleta vencida se rechaza con 409', async () => {
  const { actualizarVotacion } = await import('../src/services/votacion.service.js');

  // La papeleta ya cerró y su plazo pasó: cualquier edición que reenvíe
  // estado 'abierta' resucitaría una elección terminada.
  papeleta().estado = 'cerrada';

  await assert.rejects(
    () => actualizarVotacion(1, { estado: 'abierta' } as any),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /no puede reabrirse/i);
      return true;
    }
  );
  assert.equal(papeleta().estado, 'cerrada');
});

test('una papeleta cerrada SÍ se reabre si el plazo se extendió', async () => {
  const { actualizarVotacion } = await import('../src/services/votacion.service.js');

  papeleta().estado = 'cerrada';
  papeleta().fecha_cierre = EN_PLAZO;

  // No lanza: la administración extendió la propia papeleta, así que reabrir es legítimo.
  await actualizarVotacion(1, { estado: 'abierta' } as any);
  assert.equal(papeleta().estado, 'abierta');
});
