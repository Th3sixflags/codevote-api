/**
 * El candidato hace todo con UNA sola sesión.
 *
 * Competir no le quita nada: con el mismo token que obtiene al canjear su código
 * consulta las elecciones, vota y gestiona su lista. No debe cerrar sesión ni
 * volver a autenticarse para pasar de una cosa a otra.
 *
 * Se montan los tres routers reales sobre el mismo servidor y se usa un único
 * token en las tres, que es exactamente lo que haría el navegador.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import listaRoutes from '../src/routes/lista_candidata.routes.js';
import portalRoutes from '../src/routes/candidato_portal.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const CANDIDATO  = '1710000017'; // responsable de la lista 1
const ESTUDIANTE = '1105946139';
const ADMIN      = '1710000009';

const VOTACION = 1;
const LISTA    = 1;

interface Escenario {
  yaVoto: boolean;
  estadoLista: string;
  insertados: string[];
}

let escenario: Escenario;
const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;

const app = express();
app.use(express.json());
app.use('/api/votos', votoRoutes);
app.use('/api/listas-candidatas', listaRoutes);
app.use('/api/candidato', portalRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

/** El token tal como lo devuelve /auth/verificar tras canjear el código. */
const token = (sub: string, rol: string) =>
  jwt.sign({ sub, email: `${sub}@uide.edu.ec`, rol }, process.env.JWT_SECRET!);

const SESION_CANDIDATO = token(CANDIDATO, 'candidato');

const FILA_LISTA = {
  id_lista: LISTA, nombre_lista: 'Innovación UIDE', lema: null,
  estado_revision: 'aprobada', fecha_inscripcion: '2026-08-01', motivo_rechazo: null,
  fk_cedula_responsable: CANDIDATO, foto_url: null, fk_id_votacion: VOTACION,
  id_proceso: 1, nombre_proceso: 'Consejo Estudiantil 2026', estado_proceso: 'votacion',
  titulo_papeleta: 'Consejo', estado_votacion: 'abierta',
  carrera_votacion: null, nombre_carrera: null, tiene_votos: 0, archivada: 0, archivado_at: null,
};

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();

  // --- votación ------------------------------------------------------------
  if (sql.includes('FROM votacion v') && sql.includes('p.estado AS proceso')) {
    return [{
      votacion: 'abierta', proceso: 'votacion', carrera_votacion: null, archivado: 0,
      fecha_apertura: '2026-01-01 08:00:00', fecha_cierre: '2099-01-01 23:59:59',
      fecha_fin_votacion: '2099-01-01 23:59:59',
    }];
  }
  if (sql.includes('FROM lista_candidata WHERE id_lista = ?')) {
    return [{ estado_revision: escenario.estadoLista }];
  }
  if (sql.startsWith('SELECT 1 FROM codigo_voto')) return escenario.yaVoto ? [{ 1: 1 }] : [];
  if (sql.startsWith('INSERT INTO voto') || sql.startsWith('INSERT INTO codigo_voto')) {
    escenario.insertados.push(sql.split(' ')[2]);
    escenario.yaVoto = true; // el comprobante queda registrado
    return { insertId: 1 };
  }
  if (sql.includes('FROM voto v') && sql.includes('v.id_voto = ?')) {
    return [{ id_voto: 1, tipo_voto: 'valido', id_votacion: VOTACION, id_lista: LISTA }];
  }

  // --- carrera de quien consulta -------------------------------------------
  if (sql.includes('fk_id_carrera FROM estudiante') || sql.includes('e.fk_id_carrera')) {
    return [{ fk_id_carrera: null }];
  }

  // --- listas ---------------------------------------------------------------
  if (sql.includes('FROM lista_candidata l')) {
    if (sql.includes('l.fk_cedula_responsable = ?') && params[0] !== CANDIDATO) return [];
    return [FILA_LISTA];
  }
  if (sql.startsWith('UPDATE lista_candidata')) return { affectedRows: 1 };

  // --- integrantes y planes -------------------------------------------------
  if (sql.includes('FROM candidato c')) return [];
  if (sql.includes('FROM plan_trabajo')) return [];
  if (sql.startsWith('INSERT INTO notificacion')) return { insertId: 1 };
  if (sql.includes('FROM asignacion_candidatura a')) return [];

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(async () => {
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
  (pool as any).getConnection = async () => ({
    query: async (sql: string, params: any[] = []) => [ejecutar(sql, params), []],
    beginTransaction: async () => {}, commit: async () => {},
    rollback: async () => {}, release: () => {},
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
  escenario = { yaVoto: false, estadoLista: 'aprobada', insertados: [] };
});

async function pedir(ruta: string, opciones: { metodo?: string; token?: string; cuerpo?: any } = {}) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: {
      ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}),
      ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  return { http: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

const votar = (t: string) => pedir('/api/votos', {
  metodo: 'POST', token: t,
  cuerpo: { fk_id_votacion: VOTACION, tipo_voto: 'valido', fk_id_lista: LISTA },
});

// --- Una sola sesión para todo ----------------------------------------------

test('el candidato consulta las elecciones con su sesión', async () => {
  const { http } = await pedir(`/api/listas-candidatas/votacion/${VOTACION}`, { token: SESION_CANDIDATO });
  assert.equal(http, 200);
});

test('el candidato vota con esa MISMA sesión', async () => {
  const { http } = await votar(SESION_CANDIDATO);

  assert.equal(http, 201);
  assert.deepEqual(escenario.insertados, ['voto', 'codigo_voto']);
});

test('y entra al portal de su lista sin volver a autenticarse', async () => {
  const { http, cuerpo } = await pedir('/api/candidato/mi-lista', { token: SESION_CANDIDATO });

  assert.equal(http, 200);
  assert.equal(cuerpo.fk_cedula_responsable, CANDIDATO);
});

test('las tres cosas, en orden, con un único token', async () => {
  // El recorrido real de un candidato en una sesión: mira las listas, vota y
  // luego gestiona la suya. Ninguna de las tres debe pedirle entrar de nuevo.
  assert.equal((await pedir(`/api/listas-candidatas/votacion/${VOTACION}`, { token: SESION_CANDIDATO })).http, 200);
  assert.equal((await votar(SESION_CANDIDATO)).http, 201);
  assert.equal((await pedir('/api/candidato/mi-lista', { token: SESION_CANDIDATO })).http, 200);

  const gestion = await pedir(`/api/candidato/listas/${LISTA}`, {
    metodo: 'PATCH', token: SESION_CANDIDATO, cuerpo: { lema: 'Contigo sí se puede' },
  });
  // El proceso ya está en votación, así que la lista no se edita. Lo que importa
  // aquí es que el portal RECONOCE la sesión y la reconoce como suya: responde
  // por el ESTADO (409), no por el token (401) ni por el rol o el dueño (403).
  assert.equal(gestion.http, 409);
  assert.match(gestion.cuerpo.error, /inscripci[óo]n/i);
});

test('el candidato solo vota una vez: el segundo intento da 409', async () => {
  assert.equal((await votar(SESION_CANDIDATO)).http, 201);

  const segundo = await votar(SESION_CANDIDATO);
  assert.equal(segundo.http, 409);
  assert.match(segundo.cuerpo.error, /ya has emitido/i);
  assert.deepEqual(escenario.insertados, ['voto', 'codigo_voto'], 'se registró un segundo voto');
});

// --- Cada rol donde le corresponde ------------------------------------------

test('el estudiante vota, pero el portal del candidato le responde 403', async () => {
  const sesion = token(ESTUDIANTE, 'estudiante');

  assert.equal((await votar(sesion)).http, 201);

  const portal = await pedir('/api/candidato/mi-lista', { token: sesion });
  assert.equal(portal.http, 403);
  assert.match(portal.cuerpo.error, /rol candidato/i);
});

test('el admin no vota: 403', async () => {
  const { http, cuerpo } = await votar(token(ADMIN, 'admin'));

  assert.equal(http, 403);
  assert.match(cuerpo.error, /administraci[óo]n/i);
  assert.deepEqual(escenario.insertados, []);
});

test('el admin tampoco entra al portal del candidato: 403', async () => {
  const { http } = await pedir('/api/candidato/mi-lista', { token: token(ADMIN, 'admin') });
  assert.equal(http, 403);
});

test('las acciones administrativas sobre listas exigen admin', async () => {
  // El candidato no puede aprobar su propia lista aunque sea suya.
  const delCandidato = await pedir(`/api/listas-candidatas/${LISTA}/aprobar`, {
    metodo: 'PATCH', token: SESION_CANDIDATO, cuerpo: {},
  });
  assert.equal(delCandidato.http, 403);

  const delEstudiante = await pedir(`/api/listas-candidatas/${LISTA}/aprobar`, {
    metodo: 'PATCH', token: token(ESTUDIANTE, 'estudiante'), cuerpo: {},
  });
  assert.equal(delEstudiante.http, 403);
});

test('sin token, ninguna de las tres rutas responde', async () => {
  assert.equal((await pedir(`/api/listas-candidatas/votacion/${VOTACION}`)).http, 401);
  assert.equal((await votar('')).http, 401);
  assert.equal((await pedir('/api/candidato/mi-lista')).http, 401);
});
