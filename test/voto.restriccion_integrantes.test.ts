/**
 * Restricción electoral: nadie vota en la papeleta donde compite.
 *
 * Alcanza a TODOS los integrantes registrados en la tabla `candidato`, incluido
 * el presidente y los que conservan `rol = 'estudiante'`. En otra papeleta para
 * la que estén habilitados sí pueden votar con normalidad.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const PRESIDENTE = '1710000017';
const VOCAL      = '1710000025';
const AJENO      = '1710000108';

/** Integrantes por papeleta, tal como los resolvería la consulta real. */
const INTEGRANTES: Record<number, string[]> = {
  1: [PRESIDENTE, VOCAL],
  2: [],
};

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

const token = (sub: string) =>
  jwt.sign({ sub, email: `${sub}@uide.edu.ec`, rol: 'estudiante' }, process.env.JWT_SECRET!);

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();

  if (sql.includes('FROM votacion v') && sql.includes('p.estado AS proceso')) {
    return [{
      votacion: escenario.votacion,
      proceso: escenario.proceso,
      carrera_votacion: escenario.carreraVotacion,
    }];
  }
  // compiteEnVotacion: integrantes de la papeleta + asignaciones activas.
  if (sql.includes('FROM candidato c') && sql.includes('asignacion_candidatura a')) {
    const [cedula, votacionId] = params;
    return (INTEGRANTES[Number(votacionId)] ?? []).includes(cedula) ? [{ 1: 1 }] : [];
  }
  if (sql.includes('FROM lista_candidata WHERE id_lista = ?')) {
    return [{ 1: 1 }];
  }
  // yaVotoEstudiante: comprobante previo del estudiante en esa papeleta.
  if (sql.startsWith('SELECT 1 FROM codigo_voto')) {
    return escenario.yaVoto ? [{ 1: 1 }] : [];
  }
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
  if (sql.startsWith('INSERT INTO notificacion')) {
    return { insertId: 1 };
  }
  if (sql.includes('FROM notificacion')) {
    return [];
  }
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

async function votar(cedula: string, votacionId: number) {
  const respuesta = await fetch(`${baseUrl}/api/votos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(cedula)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fk_id_votacion: votacionId, tipo_voto: 'valido', fk_id_lista: 1 }),
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

// ---------------------------------------------------------------------------

test('el presidente no puede votar en su propia papeleta: 403', async () => {
  const { estado, cuerpo } = await votar(PRESIDENTE, 1);

  assert.equal(estado, 403);
  assert.match(cuerpo.error, /compites/i);
  assert.deepEqual(insertados, [], 'no debe registrarse ningún voto');
});

test('un integrante con rol estudiante tampoco puede votar en esa papeleta: 403', async () => {
  const { estado, cuerpo } = await votar(VOCAL, 1);

  assert.equal(estado, 403);
  assert.match(cuerpo.error, /compites/i);
  assert.deepEqual(insertados, []);
});

test('presidente e integrantes sí pueden votar en otra papeleta habilitada', async () => {
  for (const cedula of [PRESIDENTE, VOCAL]) {
    insertados = [];
    const { estado } = await votar(cedula, 2);
    assert.equal(estado, 201, `${cedula} debería poder votar en la papeleta 2`);
    assert.deepEqual(insertados, ['voto', 'codigo_voto'], 'debe guardarse el voto y su comprobante');
  }
});

test('quien no compite vota con normalidad', async () => {
  const { estado } = await votar(AJENO, 1);
  assert.equal(estado, 201);
});
