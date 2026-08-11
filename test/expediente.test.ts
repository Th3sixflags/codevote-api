process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import procesoRoutes from '../src/routes/proceso_electoral.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import * as expedienteService from '../src/services/expediente.service.js';

const app = express();
app.use(express.json());
app.use('/api/procesos-electorales', procesoRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const queryOriginal = (pool as any).query;

let dbState: any;

before(async () => {
  (pool as any).query = async (sql: string, params?: any[]) => {
    const s = sql.trim().toUpperCase();

    if (s.includes('WHERE P.ID_PROCESO = ?')) {
      const id = params?.[0];
      const instId = s.includes('FK_ID_INSTITUCION = ?') ? params?.[1] : undefined;
      
      if (id === 1 && (instId === undefined || instId === 1)) {
        return [[{ id_proceso: 1, fk_id_institucion: 1, estado: 'finalizado', nombre_proceso: 'Proceso 1', fecha_convocatoria: '2026-01-01', fecha_inicio_votacion: '2026-01-02', fecha_fin_votacion: '2026-01-03' }]];
      }
      if (id === 2 && (instId === undefined || instId === 1)) {
        return [[{ id_proceso: 2, fk_id_institucion: 1, estado: 'votacion', nombre_proceso: 'Proceso 2' }]];
      }
      return [[]];
    }
    
    if (s.includes('FROM VOTACION V LEFT JOIN CARRERA C')) {
      return [[{ id_votacion: 10, titulo_papeleta: 'Global' }]];
    }
    
    if (s.includes('FROM ACTA_RESULTADOS')) {
      return [[{ total_votantes: 100, votos_validos: 90, votos_blanco: 5, votos_nulos: 5, lista_ganadora: 'Lista A' }]];
    }
    
    if (s.includes('FROM CODIGO_VOTO')) {
      return [[{ total: 200 }]];
    }

    if (s.includes('FROM LISTA_CANDIDATA')) {
      return [[{ id_lista: 30, nombre_lista: 'Lista A', lema: 'Lema A' }]];
    }

    if (s.includes('FROM CANDIDATO C JOIN ESTUDIANTE')) {
      return [[{ cargo: 'Presidente', nombres: 'Juan', apellidos: 'Perez' }]];
    }
    
    if (s.includes('FROM PLAN_TRABAJO')) {
      return [[{ area: 'academico', archivo_url: 'http://test.pdf' }]];
    }
    
    if (s.includes('FROM VEEDURIA VD JOIN VEEDOR')) {
      return [[{ momento: 'apertura', observacion: 'Todo bien', nombre: 'Inspector', tipo_veedor: 'externo' }]];
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

function getToken(payload: any) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

test('Descargar expediente exitoso (Proceso finalizado)', async () => {
  const token = getToken({ sub: '123', rol: 'admin', fk_id_institucion: 1 });
  const res = await fetch(`${baseUrl}/api/procesos-electorales/1/expediente`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 0);
});

test('Rechazar descarga si el proceso no está finalizado (409)', async () => {
  const token = getToken({ sub: '123', rol: 'admin', fk_id_institucion: 1 });
  const res = await fetch(`${baseUrl}/api/procesos-electorales/2/expediente`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.match(data.error, /finalizados o cancelados/i);
});

test('Rechazar descarga de otra institución (403/404)', async () => {
  const token = getToken({ sub: '123', rol: 'admin', fk_id_institucion: 2 });
  const res = await fetch(`${baseUrl}/api/procesos-electorales/1/expediente`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  // Dependiendo de cómo funcione findById, si no lo encuentra por institucionId, arroja 404
  assert.equal(res.status, 404);
});
