/**
 * Visibilidad de las listas candidatas.
 *
 * Una candidatura solo es pública cuando la administración la aprueba. Quien
 * navega por Elecciones —estudiante o candidato— recibe únicamente las listas
 * con `estado_revision = 'aprobada'`: pendiente, en_revision, rechazada y
 * retirada no aparecen, ni en los listados ni por acceso directo al ID.
 *
 * Excepción: el responsable sigue viendo SU propia lista, que es la que gestiona
 * desde el Portal del candidato aunque todavía no esté aprobada.
 *
 * El doble de MySQL interpreta las condiciones que arma el repositorio (carrera
 * de la papeleta y estado de revisión), así que la prueba ejercita el SQL real.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import listaRoutes from '../src/routes/lista_candidata.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const RESPONSABLE = '1710000017'; // responsable de la lista 3 (pendiente)
const ESTUDIANTE  = '1105946139';
const ADMIN       = '1710000009';

interface Fila {
  id_lista: number;
  nombre_lista: string;
  estado_revision: string;
  fk_cedula_responsable: string | null;
  carrera_votacion: number | null;
  id_proceso: number;
  fk_id_votacion: number;
}

/** Una lista por cada estado de revisión, todas en el mismo proceso y papeleta. */
const LISTAS: Fila[] = [
  { id_lista: 1, nombre_lista: 'Halo',    estado_revision: 'aprobada',    fk_cedula_responsable: '1710000100', carrera_votacion: null, id_proceso: 7, fk_id_votacion: 4 },
  { id_lista: 2, nombre_lista: 'Nexus',   estado_revision: 'en_revision', fk_cedula_responsable: '1710000101', carrera_votacion: null, id_proceso: 7, fk_id_votacion: 4 },
  { id_lista: 3, nombre_lista: 'Orion',   estado_revision: 'pendiente',   fk_cedula_responsable: RESPONSABLE,  carrera_votacion: null, id_proceso: 7, fk_id_votacion: 4 },
  { id_lista: 4, nombre_lista: 'Vega',    estado_revision: 'rechazada',   fk_cedula_responsable: '1710000102', carrera_votacion: null, id_proceso: 7, fk_id_votacion: 4 },
  { id_lista: 5, nombre_lista: 'Sirius',  estado_revision: 'retirada',    fk_cedula_responsable: '1710000103', carrera_votacion: null, id_proceso: 7, fk_id_votacion: 4 },
];

const queryOriginal = (pool as any).query;
let sentencias: string[] = [];

const app = express();
app.use(express.json());
app.use('/api/listas-candidatas', listaRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const token = (sub: string, rol: string) =>
  jwt.sign({ sub, email: `${sub}@uide.edu.ec`, rol }, process.env.JWT_SECRET!);

function fila(l: Fila) {
  return {
    ...l,
    lema: null, fecha_inscripcion: '2026-08-01', motivo_rechazo: null, foto_url: null,
    nombre_proceso: 'Consejo Estudiantil', estado_proceso: 'inscripcion',
    titulo_papeleta: 'Papeleta', estado_votacion: 'abierta', nombre_carrera: null,
    tiene_votos: 0, archivada: 0, archivado_at: null,
  };
}

/**
 * Aplica las condiciones que el repositorio escribió en el SQL. Si un día deja
 * de filtrar por estado, aquí no se filtra nada y las pruebas fallan.
 */
function filtrar(sql: string, params: any[]): Fila[] {
  let filas = LISTAS.slice();
  let i = 0;

  if (sql.includes('l.fk_id_proceso = ?') || sql.includes('l.fk_id_votacion = ?') || sql.includes('l.id_lista = ?')) {
    const valor = Number(params[i]); i += 1;
    if (sql.includes('l.fk_id_proceso = ?'))  filas = filas.filter((l) => l.id_proceso === valor);
    if (sql.includes('l.fk_id_votacion = ?')) filas = filas.filter((l) => l.fk_id_votacion === valor);
    if (sql.includes('l.id_lista = ?'))       filas = filas.filter((l) => l.id_lista === valor);
  }

  if (sql.includes('vo.fk_id_carrera IS NULL OR vo.fk_id_carrera = ?')) {
    const carrera = Number(params[i]); i += 1;
    filas = filas.filter((l) => l.carrera_votacion === null || l.carrera_votacion === carrera);
  } else if (sql.includes('AND vo.fk_id_carrera IS NULL')) {
    filas = filas.filter((l) => l.carrera_votacion === null);
  }

  if (sql.includes("l.estado_revision = 'aprobada' OR l.fk_cedula_responsable = ?")) {
    const cedula = params[i]; i += 1;
    filas = filas.filter((l) => l.estado_revision === 'aprobada' || l.fk_cedula_responsable === cedula);
  } else if (sql.includes("AND l.estado_revision = 'aprobada'")) {
    filas = filas.filter((l) => l.estado_revision === 'aprobada');
  }

  return filas;
}

before(async () => {
  (pool as any).query = async (sqlCrudo: string, params: any[] = []) => {
    const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
    sentencias.push(sql);

    // Carrera del estudiante que consulta (para el filtro por carrera).
    if (sql.includes('fk_id_carrera FROM estudiante') && sql.includes('cedula = ?')) {
      return [[{ fk_id_carrera: null }], []];
    }
    if (sql.includes('FROM lista_candidata l')) {
      return [filtrar(sql, params).map(fila), []];
    }
    // Detalle: integrantes y planes de la lista.
    if (sql.includes('FROM candidato c') || sql.includes('FROM plan_trabajo')) return [[], []];

    throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
  };

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  (pool as any).query = queryOriginal;
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

async function pedir(ruta: string, sub: string, rol: string) {
  sentencias = [];
  const respuesta = await fetch(`${baseUrl}/api/listas-candidatas${ruta}`, {
    headers: { Authorization: `Bearer ${token(sub, rol)}` },
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

/** Las cuatro lecturas: listado general, por proceso, por papeleta y detalle. */
const LISTADOS = ['', '/proceso/7', '/votacion/4'];

const nombres = (cuerpo: any[]) => cuerpo.map((l) => l.nombre_lista).sort();

// --- Estudiante -------------------------------------------------------------

test('el estudiante solo ve listas aprobadas en los tres listados', async () => {
  for (const ruta of LISTADOS) {
    const { estado, cuerpo } = await pedir(ruta, ESTUDIANTE, 'estudiante');
    assert.equal(estado, 200);
    assert.deepEqual(nombres(cuerpo), ['Halo'], `${ruta || '/'} filtró mal`);
  }
});

test('pendiente, en_revision, rechazada y retirada nunca salen', async () => {
  for (const ruta of LISTADOS) {
    const { cuerpo } = await pedir(ruta, ESTUDIANTE, 'estudiante');
    const estados = (cuerpo as any[]).map((l) => l.estado_revision);
    for (const oculto of ['pendiente', 'en_revision', 'rechazada', 'retirada']) {
      assert.ok(!estados.includes(oculto), `${ruta || '/'} devolvió una lista ${oculto}`);
    }
  }
});

test('el acceso directo del estudiante a una lista no aprobada responde 404', async () => {
  for (const id of [2, 3, 4, 5]) {
    const { estado, cuerpo } = await pedir(`/${id}`, ESTUDIANTE, 'estudiante');
    assert.equal(estado, 404, `la lista ${id} se le mostró al estudiante`);
    assert.match(cuerpo.error, /no encontrada/i);
  }
});

test('el estudiante sí puede abrir el detalle de una lista aprobada', async () => {
  const { estado, cuerpo } = await pedir('/1', ESTUDIANTE, 'estudiante');
  assert.equal(estado, 200);
  assert.equal(cuerpo.nombre_lista, 'Halo');
});

// --- Candidato --------------------------------------------------------------

test('el candidato ve lo mismo que el estudiante, más su propia lista', async () => {
  for (const ruta of LISTADOS) {
    const { cuerpo } = await pedir(ruta, RESPONSABLE, 'candidato');
    assert.deepEqual(nombres(cuerpo), ['Halo', 'Orion'], `${ruta || '/'} filtró mal`);
  }
});

test('el responsable abre el detalle de su lista aunque siga pendiente', async () => {
  const { estado, cuerpo } = await pedir('/3', RESPONSABLE, 'candidato');
  assert.equal(estado, 200);
  assert.equal(cuerpo.estado_revision, 'pendiente');
});

test('un candidato no ve la lista pendiente de otro', async () => {
  const { estado } = await pedir('/2', RESPONSABLE, 'candidato');
  assert.equal(estado, 404);
});

// --- Administración ---------------------------------------------------------

test('el admin ve todas las listas en cualquier estado', async () => {
  for (const ruta of LISTADOS) {
    const { cuerpo } = await pedir(ruta, ADMIN, 'admin');
    assert.deepEqual(nombres(cuerpo), ['Halo', 'Nexus', 'Orion', 'Sirius', 'Vega']);
  }
});

test('el admin abre el detalle de cualquier lista', async () => {
  for (const id of [1, 2, 3, 4, 5]) {
    const { estado } = await pedir(`/${id}`, ADMIN, 'admin');
    assert.equal(estado, 200, `el admin no pudo abrir la lista ${id}`);
  }
});

test('la consulta del admin no lleva condición de estado de revisión', async () => {
  await pedir('', ADMIN, 'admin');
  const consulta = sentencias.find((s) => s.includes('FROM lista_candidata l'))!;
  assert.ok(!consulta.includes('estado_revision ='), 'el admin recibió un filtro por estado');
});

test('el filtro por estado viaja en el SQL, no se aplica después', async () => {
  await pedir('', ESTUDIANTE, 'estudiante');
  const consulta = sentencias.find((s) => s.includes('FROM lista_candidata l'))!;
  assert.ok(
    consulta.includes("l.estado_revision = 'aprobada'"),
    'las listas no aprobadas salen de la base y se filtran en memoria'
  );
});
