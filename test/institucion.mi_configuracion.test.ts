process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import institucionRoutes from '../src/routes/institucion.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

interface Estado {
  institucionActiva: boolean;
  institucionId: number;
}

let estado: Estado;
const queryOriginal = (pool as any).query;

const app = express();
app.use(express.json());
app.use('/api/instituciones', institucionRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

before(async () => {
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

beforeEach(() => {
  estado = {
    institucionActiva: true,
    institucionId: 1
  };

  (pool as any).query = async (sql: string, params?: any[]) => {
    // Mock for "findById" used by /mi-configuracion
    if (sql.includes('FROM institucion WHERE id_institucion = ?')) {
      const id = params?.[0];
      if (id === estado.institucionId) {
        return [[{
          id_institucion: id,
          nombre: 'Universidad de Prueba',
          slug: 'uni-prueba',
          tipo: 'universidad',
          logo_url: '/logo.png',
          colores_json: { primary: '#000' },
          config_json: { requiere_promedio: true },
          activo: estado.institucionActiva ? 1 : 0
        }]];
      }
      return [[]]; // not found
    }
    // Mock for global list (superadmin)
    if (sql.includes('FROM institucion ORDER BY nombre')) {
      return [[{ id_institucion: 1, nombre: 'Univ A' }, { id_institucion: 2, nombre: 'Univ B' }]];
    }
    return [[]];
  };
});

function getToken(payload: any) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

test('GET /mi-configuracion - Usuario obtiene su institución', async () => {
  const token = getToken({ sub: '12345', rol: 'estudiante', fk_id_institucion: 1 });
  const req = await fetch(`${baseUrl}/api/instituciones/mi-configuracion`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  assert.equal(req.status, 200);
  const data = await req.json();
  assert.equal(data.id_institucion, 1);
  assert.equal(data.slug, 'uni-prueba');
  assert.equal(data.activa, true);
  assert.deepEqual(data.colores_json, { primary: '#000' });
});

test('GET /mi-configuracion - Falla si la institución está suspendida', async () => {
  estado.institucionActiva = false;
  const token = getToken({ sub: '12345', rol: 'estudiante', fk_id_institucion: 1 });
  const req = await fetch(`${baseUrl}/api/instituciones/mi-configuracion`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  assert.equal(req.status, 403);
  const data = await req.json();
  assert.match(data.error, /suspendida/i);
});

test('GET /mi-configuracion - Falla si el usuario no tiene institución', async () => {
  const token = getToken({ sub: 'super', rol: 'superadmin' }); // Sin fk_id_institucion
  const req = await fetch(`${baseUrl}/api/instituciones/mi-configuracion`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  assert.equal(req.status, 403);
  const data = await req.json();
  assert.match(data.error, /no pertenece/i);
});

test('GET / - Admin no puede listar instituciones, solo SuperAdmin', async () => {
  // Admin intenta consultar la lista global (eso es GET /)
  const adminToken = getToken({ sub: 'admin1', rol: 'admin', fk_id_institucion: 1 });
  const req1 = await fetch(`${baseUrl}/api/instituciones`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(req1.status, 403); // Prohibido
  
  // SuperAdmin intenta consultar la lista global
  const superToken = getToken({ sub: 'super', rol: 'superadmin' });
  const req2 = await fetch(`${baseUrl}/api/instituciones`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  assert.equal(req2.status, 200); // OK
  const data = await req2.json();
  assert.equal(data.length, 2);
});
