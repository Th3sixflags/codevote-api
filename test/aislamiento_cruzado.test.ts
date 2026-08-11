process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votacionRoutes from '../src/routes/votacion.routes.js';
import listaRoutes from '../src/routes/lista_candidata.routes.js';
import candidatoRoutes from '../src/routes/candidato.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { estadoVacio, instalarDoble, type Estado } from './_dobleMysql.js';

let estado: Estado;
let restaurar: () => void;

const app = express();
app.use(express.json());
app.use('/api/votaciones', votacionRoutes);
app.use('/api/listas', listaRoutes);
app.use('/api/candidatos', candidatoRoutes);
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
  restaurar();
});

beforeEach(() => {
  estado = estadoVacio();
  restaurar = instalarDoble(estado, pool);

  // Institucion A
  estado.estudiantes.push({
    cedula: '111', nombres: 'Admin A', apellidos: '', rol: 'admin', promedio: 0, id_carrera: null
  });

  // Institucion B
  estado.estudiantes.push({
    cedula: '222', nombres: 'Admin B', apellidos: '', rol: 'admin', promedio: 0, id_carrera: null
  });

  // Proceso en A (fk_id_institucion is missing in Proceso interface, but _dobleMysql seems to mock specific queries or just state? Wait, _dobleMysql's Proceso has no fk_id_institucion... Let's look at _dobleMysql's interfaces)
  // Skip manually building db.filas, let's just write the queries manually because _dobleMysql doesn't know about fk_id_institucion yet? Wait, _dobleMysql does not have fk_id_institucion!
  // I should just use express with a mocked `pool.query` for this specific test instead of `_dobleMysql`.
  restaurar(); // uninstall the default one
  
  (pool as any).query = async (sql: string, params?: any[]) => {
    // Votacion 200 pertenece a proceso 20 (inst B)
    if (sql.includes('FROM votacion v') && sql.includes('JOIN proceso_electoral p')) {
      const votId = params?.[0];
      const instId = params?.[1];
      
      if (votId === 200 && (instId === 2 || instId === undefined)) {
        return [[{
          id_votacion: 200, titulo_papeleta: 'Votacion B', estado: 'abierta', fk_id_proceso: 20, fk_id_carrera: null
        }], null];
      }
      return [[], null];
    }
    return [[], null];
  };
});

function tokenPara(rol: string, cedula: string, institucionId?: number) {
  return jwt.sign(
    { sub: cedula, rol, fk_id_institucion: institucionId },
    process.env.JWT_SECRET!
  );
}

test('Aislamiento cruzado: admin de A no ve recursos de B', async () => {
  const adminA = tokenPara('admin', '111', 1);

  // Votacion de B
  let res = await fetch(`${baseUrl}/api/votaciones/200`, {
    headers: { Authorization: `Bearer ${adminA}` }
  });
  assert.equal(res.status, 404, 'Admin A no debería ver votación de B');

  // Listas de la votacion de B
  res = await fetch(`${baseUrl}/api/votaciones/200/listas`, {
    headers: { Authorization: `Bearer ${adminA}` }
  });
  assert.equal(res.status, 404, 'Admin A no debería listar de votación de B');
});

test('Aislamiento cruzado: superadmin conserva acceso global', async () => {
  const superadmin = tokenPara('superadmin', '999');

  // Superadmin no tiene institucionId en el token
  const res = await fetch(`${baseUrl}/api/votaciones/200`, {
    headers: { Authorization: `Bearer ${superadmin}` }
  });
  assert.equal(res.status, 200, 'Superadmin debería ver votación de B sin filtros');
});
