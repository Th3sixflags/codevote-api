process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import * as authService from '../src/services/auth.service.js';

// Mock de la base de datos de usuarios
const dbState: Record<string, any> = {
  'stchinininca@uide.edu.ec': {
    cedula: '1710000009',
    correo_institucional: 'stchinininca@uide.edu.ec',
    nombres: 'Steven',
    apellidos: 'Chininin',
    rol: 'superadmin',
    fk_id_institucion: 1,
    estado_academico: 'activo',
    activo: 1,
  },
  'candidato@uide.edu.ec': {
    cedula: '1710000010',
    correo_institucional: 'candidato@uide.edu.ec',
    nombres: 'Deyvi',
    apellidos: 'Candidato',
    rol: 'candidato',
    fk_id_institucion: 1,
    estado_academico: 'activo',
    activo: 1,
  },
  'estudiante@uide.edu.ec': {
    cedula: '1710000011',
    correo_institucional: 'estudiante@uide.edu.ec',
    nombres: 'Estudiante',
    apellidos: 'Normal',
    rol: 'estudiante',
    fk_id_institucion: 1,
    estado_academico: 'activo',
    activo: 1,
  },
  'admin@uide.edu.ec': {
    cedula: '1710000012',
    correo_institucional: 'admin@uide.edu.ec',
    nombres: 'Admin',
    apellidos: 'Institucional',
    rol: 'admin',
    fk_id_institucion: 2,
    estado_academico: 'activo',
    activo: 1,
  }
};

const codigosVigentes: Record<string, any> = {};

let originalQuery: any;
let originalGetConnection: any;
let originalComponerCorreo: any;

before(() => {
  originalQuery = (pool as any).query;
  originalGetConnection = (pool as any).getConnection;
  originalComponerCorreo = (authService as any).componerCorreoDeCodigo;

  (pool as any).query = async (sql: string, params?: any[]) => {
    const s = sql.trim().toUpperCase();

    // Normalizar espacios y saltos de línea para el match
    const normalizedSql = s.replace(/\s+/g, ' ');

    if (normalizedSql.includes('SELECT CEDULA, NOMBRES, APELLIDOS, CORREO_INSTITUCIONAL, ROL, FOTO_URL, FK_ID_INSTITUCION FROM ESTUDIANTE')) {
      const identificador = params?.[0];
      const user = Object.values(dbState).find(u => u.correo_institucional === identificador || u.cedula === identificador);
      return [user ? [user] : []];
    }
    
    if (normalizedSql.includes('FROM CODIGO_ACCESO') && normalizedSql.includes('USADO_AT IS NULL')) {
      const cedula = params?.[0];
      const entry = codigosVigentes[cedula];
      return [entry ? [entry] : []];
    }

    if (s.includes('INSERT INTO CODIGO_ACCESO')) {
      const cedula = params?.[0];
      const codigo_hash = params?.[1];
      const vigencia = Number(params?.[2] ?? 600);
      codigosVigentes[cedula] = {
        id_codigo: 1,
        codigo_hash,
        intentos: 0,
        creado_at: new Date().toISOString(),
        expira_at: new Date(Date.now() + vigencia * 1000).toISOString(),
        usado_at: null,
      };
      return [{ insertId: 1 }];
    }

    if (normalizedSql.startsWith('UPDATE CODIGO_ACCESO SET USADO_AT = NOW() WHERE FK_CEDULA_ESTUDIANTE')) {
      const entry = codigosVigentes[params?.[0]];
      if (entry) entry.usado_at = new Date().toISOString();
      return [{ affectedRows: entry ? 1 : 0 }];
    }

    if (normalizedSql.startsWith('UPDATE CODIGO_ACCESO SET USADO_AT = NOW() WHERE ID_CODIGO')) {
      const entry = Object.values(codigosVigentes).find((v: any) => v.id_codigo === params?.[0] && v.usado_at == null) as any;
      if (entry) entry.usado_at = new Date().toISOString();
      return [{ affectedRows: entry ? 1 : 0 }];
    }

    if (s.includes('UPDATE CODIGO_ACCESO SET INTENTOS = INTENTOS + 1')) {
      return [{}];
    }

    if (s.includes('DELETE FROM CODIGO_ACCESO WHERE ID_CODIGO = ?')) {
      const id = params?.[0];
      const entry = Object.entries(codigosVigentes).find(([_, v]) => v.id_codigo === id);
      if (entry) delete codigosVigentes[entry[0]];
      return [{}];
    }

    return [[]];
  };

  (pool as any).getConnection = async () => ({
    query: (sql: string, params?: any[]) => (pool as any).query(sql, params),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

});

after(() => {
  (pool as any).query = originalQuery;
  (pool as any).getConnection = originalGetConnection;
});

test('1. Steven solicita código y, al verificar, obtiene rol superadmin con acceso global', async () => {
  const req = await authService.solicitarCodigo('stchinininca@uide.edu.ec', null);
  assert.equal(req.correo_enmascarado, 's********a@uide.edu.ec');
  
  const { createHash } = await import('crypto');
  const testCode = '123456';
  codigosVigentes['1710000009'].codigo_hash = createHash('sha256').update(testCode).digest('hex');

  const { token, usuario } = await authService.verificarCodigo('stchinininca@uide.edu.ec', testCode, null);
  
  assert.equal(usuario.rol, 'superadmin');
  assert.equal(usuario.fk_id_institucion, undefined, 'Superadmin no debe estar atado a una institución');

  const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
  assert.equal(payload.rol, 'superadmin');
  assert.equal(payload.fk_id_institucion, undefined);
});

test('2. Deyvi obtiene rol candidato', async () => {
  await authService.solicitarCodigo('candidato@uide.edu.ec', null);
  const { createHash } = await import('crypto');
  const testCode = '123456';
  codigosVigentes['1710000010'].codigo_hash = createHash('sha256').update(testCode).digest('hex');

  const { token, usuario } = await authService.verificarCodigo('candidato@uide.edu.ec', testCode, null);
  assert.equal(usuario.rol, 'candidato');
  assert.equal(usuario.fk_id_institucion, 1);
});

test('3. Un estudiante normal obtiene rol estudiante', async () => {
  await authService.solicitarCodigo('estudiante@uide.edu.ec', null);
  const { createHash } = await import('crypto');
  const testCode = '123456';
  codigosVigentes['1710000011'].codigo_hash = createHash('sha256').update(testCode).digest('hex');

  const { token, usuario } = await authService.verificarCodigo('estudiante@uide.edu.ec', testCode, null);
  assert.equal(usuario.rol, 'estudiante');
  assert.equal(usuario.fk_id_institucion, 1);
});

test('4. Admin obtiene rol admin y retiene su institución', async () => {
  await authService.solicitarCodigo('admin@uide.edu.ec', null);
  const { createHash } = await import('crypto');
  const testCode = '123456';
  codigosVigentes['1710000012'].codigo_hash = createHash('sha256').update(testCode).digest('hex');

  const { token, usuario } = await authService.verificarCodigo('admin@uide.edu.ec', testCode, null);
  assert.equal(usuario.rol, 'admin');
  assert.equal(usuario.fk_id_institucion, 2);
});
