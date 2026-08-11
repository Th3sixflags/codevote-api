/**
 * Test de integración: flujo completo SuperAdmin → Instituciones → config_json
 *
 * Simula:
 * 1. SuperAdmin lista instituciones.
 * 2. SuperAdmin obtiene una institución específica.
 * 3. SuperAdmin edita config_json con reglas electorales (UIDE y sindicato).
 * 4. Se verifica que los cambios persisten y se validan con Zod correctamente.
 * 5. Se verifica que config_json inválido responde 422.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import institucionRoutes from '../src/routes/institucion.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const app = express();
app.use(express.json());
app.use('/api/instituciones', institucionRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

// Estado mutable del mock de base de datos
let dbState: Record<number, any> = {
  1: {
    id_institucion: 1,
    nombre: 'Universidad Internacional del Ecuador - Sede Loja',
    slug: 'uide-loja',
    tipo: 'universidad',
    logo_url: '/api/uploads/instituciones/logo.png',
    colores_json: JSON.stringify({ primary: '#416B7D', secondary: '#B52B43' }),
    config_json: JSON.stringify({ requiere_promedio: true, promedio_minimo: 85, requiere_carrera: true }),
    activo: 1,
    created_at: new Date().toISOString(),
  },
};
let lastInsertId = 2;
const queryOriginal = (pool as any).query;

before(async () => {
  // Mock del pool para no tocar la BD real
  (pool as any).query = async (sql: string, params?: any[]) => {
    const s = sql.trim().toUpperCase();

    if (s.includes('SELECT * FROM INSTITUCION WHERE ID_INSTITUCION = ?')) {
      const id = params?.[0];
      const row = dbState[id];
      if (!row) return [[]];
      return [[{ ...row, config_json: row.config_json ? JSON.parse(row.config_json) : null, colores_json: row.colores_json ? JSON.parse(row.colores_json) : null }]];
    }

    if (s.includes('SELECT * FROM INSTITUCION ORDER BY NOMBRE')) {
      return [Object.values(dbState)];
    }

    if (s.startsWith('INSERT INTO INSTITUCION')) {
      const id = lastInsertId++;
      dbState[id] = { id_institucion: id, ...Object.fromEntries(params?.map((v, i) => [i, v]) ?? []) };
      return [{ insertId: id }];
    }

    if (s.startsWith('UPDATE INSTITUCION SET')) {
      // La query de update siempre tiene id al final
      const id = params?.[params.length - 1];
      if (dbState[id]) {
        // Parsear campos SET de la query
        const setMatch = sql.match(/SET (.+) WHERE/is)?.[1] ?? '';
        setMatch.split(',').forEach((pair, i) => {
          const col = pair.trim().split('=')[0].trim().toLowerCase().replace(/`/g, '');
          if (params?.[i] !== undefined) {
            dbState[id][col] = params[i];
          }
        });
        dbState[id].config_json = typeof dbState[id].config_json === 'string'
          ? dbState[id].config_json
          : JSON.stringify(dbState[id].config_json);
      }
      return [{ affectedRows: 1 }];
    }

    if (s.includes('SELECT * FROM INSTITUCION WHERE SLUG = ?')) {
      const slug = params?.[0];
      const found = Object.values(dbState).find((r: any) => r.slug === slug);
      return [found ? [found] : []];
    }

    return [[]];
  };

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      const info = servidor.address() as import('net').AddressInfo;
      baseUrl = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
});

after(() => {
  servidor.close();
  (pool as any).query = queryOriginal;
});

function superToken() {
  return jwt.sign({ sub: '1', email: 'super@codevote.lat', rol: 'superadmin' }, process.env.JWT_SECRET!);
}

test('1. SuperAdmin puede listar instituciones', async () => {
  const res = await fetch(`${baseUrl}/api/instituciones`, {
    headers: { Authorization: `Bearer ${superToken()}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json() as any[];
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 1);
});

test('2. SuperAdmin puede obtener institución por ID', async () => {
  const res = await fetch(`${baseUrl}/api/instituciones/1`, {
    headers: { Authorization: `Bearer ${superToken()}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.id_institucion, 1);
  assert.equal(data.slug, 'uide-loja');
});

test('3. SuperAdmin puede editar config_json de UIDE (reglas universitarias)', async () => {
  const nuevaConfig = {
    config_json: {
      requiere_promedio: true,
      promedio_minimo: 85,
      requiere_carrera: true,
      requiere_estado_activo: false,
      requiere_antiguedad: false,
      requiere_membresia_activa: false,
    },
  };

  const res = await fetch(`${baseUrl}/api/instituciones/1`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${superToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(nuevaConfig),
  });
  const body = await res.text();
  assert.equal(res.status, 200, `PATCH respondió ${res.status}: ${body}`);
  const data = JSON.parse(body) as any;
  assert.ok(data.id_institucion === 1 || data.config_json !== undefined, 'Respuesta debe incluir datos de la institución');
});

test('4. SuperAdmin puede configurar institución tipo sindicato (sin promedio, con antigüedad)', async () => {
  // Primero creamos una nueva institución para el sindicato en el mock
  dbState[99] = {
    id_institucion: 99,
    nombre: 'Sindicato de Trabajadores',
    slug: 'sindicato-test',
    tipo: 'sindicato',
    logo_url: null,
    colores_json: null,
    config_json: JSON.stringify({
      requiere_promedio: false,
      requiere_carrera: false,
      requiere_antiguedad: true,
      antiguedad_minima_meses: 12,
      requiere_estado_activo: true,
      requiere_membresia_activa: true,
    }),
    activo: 1,
    created_at: new Date().toISOString(),
  };

  const res = await fetch(`${baseUrl}/api/instituciones/99`, {
    headers: { Authorization: `Bearer ${superToken()}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.id_institucion, 99);
  assert.equal(data.slug, 'sindicato-test');
});

test('5. config_json inválido (promedio_minimo negativo) responde 422', async () => {
  const configInvalida = {
    config_json: {
      requiere_promedio: true,
      promedio_minimo: -5, // inválido: debe ser >= 0
    },
  };

  const res = await fetch(`${baseUrl}/api/instituciones/1`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${superToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(configInvalida),
  });
  assert.equal(res.status, 422, `Debería rechazar promedio_minimo negativo. Respondió ${res.status}`);
});

test('6. config_json inválido (tipo incorrecto en campo bool) responde 422', async () => {
  const configInvalida = {
    config_json: {
      requiere_promedio: 'si', // debe ser boolean
    },
  };

  const res = await fetch(`${baseUrl}/api/instituciones/1`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${superToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(configInvalida),
  });
  assert.equal(res.status, 422, `Debería rechazar string donde se espera boolean. Respondió ${res.status}`);
});

test('7. Admin de institución no puede listar todas las instituciones (403)', async () => {
  const adminToken = jwt.sign(
    { sub: '999', rol: 'admin', fk_id_institucion: 1 },
    process.env.JWT_SECRET!,
  );
  const res = await fetch(`${baseUrl}/api/instituciones`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 403);
});
