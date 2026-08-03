/**
 * Quién puede votar.
 *
 * Competir NO quita el derecho al voto: candidatos e integrantes de una lista
 * votan con normalidad, incluida la papeleta en la que participan. Antes se
 * bloqueaba; la regla cambió.
 *
 * Lo que sigue vigente:
 *   - la administración no vota (no es parte del padrón);
 *   - una sola vez por papeleta;
 *   - la papeleta debe estar abierta y su proceso activo;
 *   - una papeleta de otra carrera responde 403.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const PRESIDENTE = '1710000017'; // responsable de la lista 1, rol candidato
const VOCAL      = '1710000025'; // integrante de la lista 1, rol estudiante
const AJENO      = '1710000108'; // no compite
const ADMIN      = '1710000009';

interface Escenario {
  votacion: string;
  proceso: string;
  carreraVotacion: number | null;
  carreraEstudiante: number | null;
  yaVoto: boolean;
}

let escenario: Escenario;
let insertados: string[] = [];

const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;

const app = express();
app.use(express.json());
app.use('/api/votos', votoRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const token = (sub: string, rol = 'estudiante') =>
  jwt.sign({ sub, email: `${sub}@uide.edu.ec`, rol }, process.env.JWT_SECRET!);

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();

  if (sql.includes('FROM votacion v') && sql.includes('p.estado AS proceso')) {
    return [{
      votacion: escenario.votacion,
      proceso: escenario.proceso,
      carrera_votacion: escenario.carreraVotacion,
    }];
  }
  if (sql.includes('FROM lista_candidata WHERE id_lista = ?')) return [{ 1: 1 }];
  // yaVotoEstudiante: comprobante previo en esa papeleta.
  if (sql.startsWith('SELECT 1 FROM codigo_voto')) return escenario.yaVoto ? [{ 1: 1 }] : [];
  if (sql.includes('fk_id_carrera FROM estudiante') || sql.includes('e.fk_id_carrera')) {
    return [{ fk_id_carrera: escenario.carreraEstudiante }];
  }
  if (sql.startsWith('INSERT INTO voto') || sql.startsWith('INSERT INTO codigo_voto')) {
    insertados.push(sql.split(' ')[2]);
    return { insertId: 1 };
  }
  if (sql.includes('FROM voto v') && sql.includes('v.id_voto = ?')) {
    return [{ id_voto: 1, tipo_voto: 'valido', id_votacion: 1, id_lista: 1 }];
  }
  if (sql.startsWith('INSERT INTO notificacion')) return { insertId: 1 };
  if (sql.includes('FROM notificacion')) return [];

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(async () => {
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
  (pool as any).getConnection = async () => ({
    query: async (sql: string, params: any[] = []) => [ejecutar(sql, params), []],
    beginTransaction: async () => {},
    commit: async () => {},
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
  insertados = [];
  escenario = {
    votacion: 'abierta', proceso: 'votacion',
    carreraVotacion: null, carreraEstudiante: null, yaVoto: false,
  };
});

async function votar(cedula: string, votacionId: number, rol = 'estudiante') {
  const respuesta = await fetch(`${baseUrl}/api/votos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(cedula, rol)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fk_id_votacion: votacionId, tipo_voto: 'valido', fk_id_lista: 1 }),
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

// --- El derecho al voto se conserva ----------------------------------------

test('el candidato vota en su propia papeleta: 201', async () => {
  const { estado } = await votar(PRESIDENTE, 1, 'candidato');

  assert.equal(estado, 201);
  assert.deepEqual(insertados, ['voto', 'codigo_voto'], 'debe guardarse el voto y su comprobante');
});

test('un integrante con rol estudiante vota en la papeleta donde compite su lista: 201', async () => {
  const { estado } = await votar(VOCAL, 1);

  assert.equal(estado, 201);
  assert.deepEqual(insertados, ['voto', 'codigo_voto']);
});

test('quien no compite vota con normalidad', async () => {
  const { estado } = await votar(AJENO, 1);
  assert.equal(estado, 201);
});

test('el candidato también vota en otra papeleta', async () => {
  const { estado } = await votar(PRESIDENTE, 2, 'candidato');
  assert.equal(estado, 201);
});

// --- La administración no vota ---------------------------------------------

test('el admin no puede emitir un voto: 403', async () => {
  const { estado, cuerpo } = await votar(ADMIN, 1, 'admin');

  assert.equal(estado, 403);
  assert.match(cuerpo.error, /administraci[óo]n/i);
  assert.deepEqual(insertados, [], 'no debe registrarse ningún voto');
});

// --- Las demás garantías siguen en pie --------------------------------------

test('nadie vota dos veces en la misma papeleta: 409', async () => {
  escenario.yaVoto = true;
  const { estado, cuerpo } = await votar(PRESIDENTE, 1, 'candidato');

  assert.equal(estado, 409);
  assert.match(cuerpo.error, /ya has emitido/i);
  assert.deepEqual(insertados, []);
});

test('una papeleta de otra carrera responde 403', async () => {
  escenario.carreraVotacion = 3;
  escenario.carreraEstudiante = 1;
  const { estado, cuerpo } = await votar(VOCAL, 1);

  assert.equal(estado, 403);
  assert.match(cuerpo.error, /otra carrera/i);
  assert.deepEqual(insertados, []);
});

test('la papeleta de la propia carrera sí se vota', async () => {
  escenario.carreraVotacion = 1;
  escenario.carreraEstudiante = 1;
  const { estado } = await votar(VOCAL, 1);
  assert.equal(estado, 201);
});

test('una papeleta que no está abierta no acepta votos: 409', async () => {
  escenario.votacion = 'cerrada';
  const { estado } = await votar(AJENO, 1);
  assert.equal(estado, 409);
  assert.deepEqual(insertados, []);
});

test('un proceso finalizado no acepta votos: 409', async () => {
  escenario.proceso = 'finalizado';
  const { estado } = await votar(AJENO, 1);
  assert.equal(estado, 409);
  assert.deepEqual(insertados, []);
});
