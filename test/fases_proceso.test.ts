process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import * as procesoService from '../src/services/proceso_electoral.service.js';
import * as votacionService from '../src/services/votacion.service.js';
import * as listaService from '../src/services/lista_candidata.service.js';
import { HttpError } from '../src/utils/httpError.js';

let dbState: Record<string, any> = {
  proceso: {
    1: { id_proceso: 1, estado: 'planificado', fk_id_institucion: 1 },
    2: { id_proceso: 2, estado: 'votacion', fk_id_institucion: 1 },
    3: { id_proceso: 3, estado: 'inscripcion', fk_id_institucion: 1 }
  },
  votacion: {
    10: { id_votacion: 10, fk_id_proceso: 3, fk_id_institucion: 1, id_proceso: 3 },
    20: { id_votacion: 20, fk_id_proceso: 2, fk_id_institucion: 1, id_proceso: 2 }
  }
};

const queryOriginal = (pool as any).query;

before(() => {
  (pool as any).query = async (sql: string, params?: any[]) => {
    const s = sql.trim().toUpperCase();

    if (s.includes('WHERE P.ID_PROCESO = ?')) {
      const p = dbState.proceso[params?.[0] as number];
      return [p ? [{ ...p, puede_eliminar: 1 }] : []];
    }
    
    if (s.includes('WHERE V.ID_VOTACION = ?')) {
      const v = dbState.votacion[params?.[0] as number];
      return [v ? [{ ...v, puede_eliminar: 1 }] : []];
    }
    
    if (s.includes('WHERE L.ID_LISTA = ?')) {
      return [[{ id_lista: params?.[0], id_proceso: 3, fk_id_proceso: 3, puede_eliminar: 1 }]];
    }
    
    if (s.includes('WHERE C.ID_CANDIDATO = ?')) {
      return [[{ id_candidato: params?.[0], fk_id_lista: 30, puede_eliminar: 1 }]];
    }

    if (s.includes('INSERT INTO')) return [{ insertId: 99 }];
    if (s.includes('UPDATE')) return [{ affectedRows: 1 }];

    return [[]];
  };
});

after(() => {
  (pool as any).query = queryOriginal;
});

test('Crear votacion (papeleta) es permitido en planificado', async () => {
  await assert.doesNotReject(async () => {
    await votacionService.crearVotacion({
      fk_id_proceso: 1,
      titulo_papeleta: 'Test',
      fecha_apertura: '2026-01-01 00:00:00',
      fecha_cierre: '2026-01-01 23:59:59'
    }, 1);
  });
});

test('Crear votacion (papeleta) es rechazado en fase votacion', async () => {
  await assert.rejects(async () => {
    await votacionService.crearVotacion({
      fk_id_proceso: 2,
      titulo_papeleta: 'Test',
      fecha_apertura: '2026-01-01 00:00:00',
      fecha_cierre: '2026-01-01 23:59:59'
    }, 1);
  }, (err: HttpError) => err.status === 409 && err.message.includes('Acción no permitida'));
});

test('Crear lista candidata es permitido en fase inscripcion', async () => {
  await assert.doesNotReject(async () => {
    await listaService.crearLista({
      fk_id_votacion: 10,
      nombre_lista: 'Lista 1',
      fecha_inscripcion: '2026-01-01'
    }, 1);
  });
});

test('Crear lista candidata es rechazado en fase votacion', async () => {
  await assert.rejects(async () => {
    await listaService.crearLista({
      fk_id_votacion: 20,
      nombre_lista: 'Lista 2',
      fecha_inscripcion: '2026-01-01'
    }, 1);
  }, (err: HttpError) => err.status === 409 && err.message.includes('Acción no permitida'));
});

test('Validar configuración incompleta al avanzar de fase', async () => {
  // Proceso 1 no tiene fechas de inscripción
  await assert.rejects(async () => {
    await procesoService.actualizarProceso(1, { estado: 'inscripcion' });
  }, (err: HttpError) => err.status === 409 && err.message.includes('fechas de inscripción'));
});
