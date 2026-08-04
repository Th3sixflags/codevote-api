/**
 * Doble voto por condición de carrera.
 *
 * El controlador comprueba con `yaVotoEstudiante` si la persona ya votó, pero
 * entre esa comprobación y el INSERT hay una ventana: dos peticiones
 * simultáneas del mismo estudiante pasan las dos la comprobación. Lo que impide
 * el doble comprobante es la restricción de base
 *
 *     uq_codigo_votante UNIQUE (fk_id_votacion, fk_cedula_estudiante)
 *
 * y el manejo de ER_DUP_ENTRY en el controlador, que la traduce a 409.
 *
 * Aquí el doble de MySQL IMPONE esa restricción y una barrera obliga a que
 * todas las peticiones pasen el control previo antes de que ninguna escriba,
 * de modo que la carrera se reproduce siempre y no por casualidad.
 *
 * Comprobado que la prueba tiene dientes: si el doble deja de imponer la
 * restricción —que es el estado real de la base de producción hoy—, estas
 * pruebas fallan con dos comprobantes.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const VOTANTE = '1710000108';

/** Comprobantes existentes: la clave es la del índice único. */
let comprobantes: Set<string>;

/**
 * Barrera para que la carrera sea determinista y no dependa del planificador.
 *
 * Sin ella la segunda petición solía llegar cuando la primera ya había escrito
 * su comprobante, así que la cortaba el control previo y la prueba pasaba sin
 * ejercitar nunca la restricción única: verde por el motivo equivocado.
 *
 * Con la barrera, ninguna petición escribe hasta que TODAS han pasado el
 * control previo, que es exactamente la ventana que abre el doble voto.
 */
let cruzadas = 0;              // cuántas peticiones deben cruzarse (0 = sin barrera)
let enEspera = 0;
let abrirBarrera: (() => void) | null = null;
let barrera: Promise<void> | null = null;

function prepararBarrera(n: number) {
  cruzadas = n;
  enEspera = 0;
  barrera = new Promise<void>((resolve) => { abrirBarrera = resolve; });
}

const clave = (votacionId: unknown, cedula: unknown) => `${votacionId}|${cedula}`;

const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;

const app = express();
app.use(express.json());
app.use('/api/votos', votoRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const token = (sub: string) =>
  jwt.sign({ sub, email: `${sub}@uide.edu.ec`, rol: 'estudiante' }, process.env.JWT_SECRET!);

async function ejecutar(sqlCrudo: string, params: any[] = []): Promise<any> {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();

  if (sql.includes('FROM votacion v') && sql.includes('p.estado AS proceso')) {
    // Además del estado, el servicio comprueba las FECHAS: una papeleta cuyo
    // plazo venció no admite votos aunque la columna siga diciendo 'abierta'.
    return [{
      votacion: 'abierta', proceso: 'votacion', carrera_votacion: null, archivado: 0,
      fecha_apertura: '2026-01-01 08:00:00', fecha_cierre: '2099-12-31 23:59:59',
      fecha_fin_votacion: '2099-12-31 23:59:59',
    }];
  }
  // Estado de la lista dentro de la papeleta: solo se puede votar por una aprobada.
  if (sql.includes('FROM lista_candidata WHERE id_lista = ?')) return [{ estado_revision: 'aprobada' }];
  if (sql.includes('fk_id_carrera FROM estudiante') || sql.includes('e.fk_id_carrera')) {
    return [{ fk_id_carrera: null }];
  }

  // yaVotoEstudiante: lee el estado ACTUAL de los comprobantes.
  if (sql.startsWith('SELECT 1 FROM codigo_voto')) {
    const previo = comprobantes.has(clave(params[0], params[1]));
    if (cruzadas && !previo) {
      enEspera += 1;
      if (enEspera >= cruzadas) abrirBarrera?.();
    }
    return previo ? [{ 1: 1 }] : [];
  }

  // El voto en sí. Nadie escribe hasta que todas las peticiones han pasado el
  // control previo: así la carrera se reproduce siempre, no por casualidad.
  if (sql.startsWith('INSERT INTO voto')) {
    if (cruzadas) await barrera;
    return { insertId: 1 };
  }

  // El comprobante: aquí vive la restricción única.
  if (sql.startsWith('INSERT INTO codigo_voto')) {
    const k = clave(params[0], params[2]);
    if (comprobantes.has(k)) {
      const err: any = new Error("Duplicate entry for key 'codigo_voto.uq_codigo_votante'");
      err.code = 'ER_DUP_ENTRY';
      err.errno = 1062;
      throw err;
    }
    comprobantes.add(k);
    return { insertId: comprobantes.size };
  }

  if (sql.includes('FROM voto v') && sql.includes('v.id_voto = ?')) {
    return [{ id_voto: 1, tipo_voto: 'valido', id_votacion: 1, id_lista: 1 }];
  }
  if (sql.startsWith('INSERT INTO notificacion')) return { insertId: 1 };
  if (sql.includes('FROM notificacion')) return [];

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(async () => {
  (pool as any).query = async (sql: string, params: any[] = []) => [await ejecutar(sql, params), []];
  (pool as any).getConnection = async () => ({
    query: async (sql: string, params: any[] = []) => [await ejecutar(sql, params), []],
    beginTransaction: async () => {},
    commit: async () => {},
    // El rollback deshace el voto, pero el comprobante nunca llegó a escribirse.
    rollback: async () => {},
    release: () => {},
  });

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  (pool as any).query = queryOriginal;
  (pool as any).getConnection = getConnectionOriginal;
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

beforeEach(() => {
  comprobantes = new Set();
  cruzadas = 0;
  enEspera = 0;
  barrera = null;
  abrirBarrera = null;
});

function votar(cedula: string, votacionId = 1) {
  return fetch(`${baseUrl}/api/votos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(cedula)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fk_id_votacion: votacionId, tipo_voto: 'valido', fk_id_lista: 1 }),
  }).then((r) => r.status);
}

// ---------------------------------------------------------------------------

test('dos peticiones simultáneas solo generan un comprobante', async () => {
  // Ninguna escribe hasta que las dos pasaron el control previo.
  prepararBarrera(2);

  const [a, b] = await Promise.all([votar(VOTANTE), votar(VOTANTE)]);
  const codigos = [a, b].sort();

  assert.deepEqual(codigos, [201, 409], `se esperaba un 201 y un 409, llegó ${JSON.stringify(codigos)}`);
  assert.equal(comprobantes.size, 1, 'solo puede quedar un comprobante');
});

test('cinco peticiones simultáneas siguen dejando un solo comprobante', async () => {
  prepararBarrera(5);

  const codigos = await Promise.all(Array.from({ length: 5 }, () => votar(VOTANTE)));

  assert.equal(codigos.filter((c) => c === 201).length, 1, 'solo una debe registrarse');
  assert.equal(codigos.filter((c) => c === 409).length, 4, 'el resto debe recibir 409');
  assert.equal(comprobantes.size, 1);
});

test('el 409 por carrera dice lo mismo que el control previo', async () => {
  prepararBarrera(2);
  const respuestas = await Promise.all([
    fetch(`${baseUrl}/api/votos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(VOTANTE)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fk_id_votacion: 1, tipo_voto: 'valido', fk_id_lista: 1 }),
    }),
    fetch(`${baseUrl}/api/votos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(VOTANTE)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fk_id_votacion: 1, tipo_voto: 'valido', fk_id_lista: 1 }),
    }),
  ]);

  const rechazada = respuestas.find((r) => r.status === 409)!;
  const cuerpo = await rechazada.json();
  assert.match(cuerpo.error, /Ya has emitido tu voto/i);
});

test('una segunda votación posterior (no simultánea) también se rechaza', async () => {
  assert.equal(await votar(VOTANTE), 201);
  assert.equal(await votar(VOTANTE), 409, 'lo corta el control previo, sin llegar a la base');
  assert.equal(comprobantes.size, 1);
});

test('en otra papeleta el mismo estudiante sí puede votar', async () => {
  assert.equal(await votar(VOTANTE, 1), 201);
  assert.equal(await votar(VOTANTE, 2), 201);
  assert.equal(comprobantes.size, 2);
});
