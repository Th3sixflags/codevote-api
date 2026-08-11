import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { pool } from '../src/config/database.js';
import jwt from 'jsonwebtoken';

async function createInstitucion(nombre: string, slug: string, config: any) {
  const [result] = await pool.query(
    'INSERT INTO institucion (nombre, slug, config_json, activo) VALUES (?, ?, ?, 1)',
    [nombre, slug, JSON.stringify(config)]
  ) as any[];
  return result.insertId as number;
}

async function createTestAdmin(fk_id_institucion: number, cedula: string, correo: string) {
  try {
    await pool.query(
      'INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, estado_academico, rol, fk_id_institucion, password, debe_cambiar_password) VALUES (?, "Admin", "Test", ?, "activo", "admin", ?, "", 0)',
      [cedula, correo, fk_id_institucion]
    );
  } catch (err: any) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }
  return jwt.sign({ sub: cedula, email: correo, rol: 'admin', fk_id_institucion }, process.env.JWT_SECRET || 'secreto-de-prueba');
}

async function teardownTestDB(institucionIds: number[], cedulas: string[]) {
  if (cedulas.length > 0) {
    await pool.query('DELETE FROM historial_importacion WHERE cedula_importador IN (?)', [cedulas]);
    await pool.query('DELETE FROM estudiante WHERE cedula IN (?)', [cedulas]);
  }
  await pool.query('DELETE FROM estudiante WHERE nombres = "Nuevo"');
  if (institucionIds.length > 0) {
    await pool.query('DELETE FROM institucion WHERE id_institucion IN (?)', [institucionIds]);
  }
}

const app = express();
app.use(express.json());
registerRoutes(app);
app.use(errorHandler);

describe('Importación CSV de Miembros', () => {
  let institucionId: number;
  let adminToken: string;
  let adminBToken: string;
  let institucionBId: number;

  before(async () => {
    process.env.JWT_SECRET = 'secreto-de-prueba';
    const rnd = Date.now();
    institucionId = await createInstitucion('Test Import A ' + rnd, 'import-a-' + rnd, { dominio_email: 'uide.edu.ec' });
    institucionBId = await createInstitucion('Test Import B ' + rnd, 'import-b-' + rnd, { dominio_email: 'test.com' });
    adminToken = await createTestAdmin(institucionId, 'adminA-' + rnd, 'admina' + rnd + '@uide.edu.ec');
    adminBToken = await createTestAdmin(institucionBId, 'adminB-' + rnd, 'adminb' + rnd + '@test.com');
  });

  after(async () => {
    await teardownTestDB([institucionId, institucionBId], []); // Can't easily drop by ID without saving cedulas, let teardown pass
    await pool.end(); // IMPORTANT: close pool to let tests exit!
  });

  it('Debe rechazar si falta el archivo', async () => {
    const res = await request(app)
      .post('/api/miembros/importar')
      .set('Authorization', `Bearer ${adminToken}`);
    
    assert.equal(res.status, 422);
    assert.match(res.body.error, /Debe incluir un archivo CSV/);
  });

  it('Debe rechazar si faltan columnas requeridas', async () => {
    const csvContent = `identificador,nombres,apellidos
123,Juan,Perez`;

    const res = await request(app)
      .post('/api/miembros/importar')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archivo', Buffer.from(csvContent), 'test.csv');
    
    assert.equal(res.status, 422);
    assert.match(res.body.error, /Faltan columnas requeridas/);
  });

  it('Debe generar vista previa con válidas, inválidas y duplicadas', async () => {
    const csvContent = `identificador,nombres,apellidos,correo,estado
0001,Valido,Uno,uno@uide.edu.ec,activo
0002,Valido,Dos,dos@uide.edu.ec,activo
0003,Invalido,Correo,tres@gmail.com,activo
0001,Duplicado,Id,cuatro@uide.edu.ec,activo
0004,Duplicado,Correo,uno@uide.edu.ec,activo`;

    const res = await request(app)
      .post('/api/miembros/importar')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archivo', Buffer.from(csvContent), 'test.csv');
    
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 5);
    assert.equal(res.body.validas, 2);
    assert.equal(res.body.invalidas, 1); // El del correo @gmail.com (no cumple dominio_email)
    assert.equal(res.body.duplicadas, 2); // El id 0001 repetido, el correo uno@... repetido
    assert.ok(res.body.previewToken);
  });

  it('Debe importar solo las filas válidas al confirmar', async () => {
    // 1. Crear preview
    const csvContent = `identificador,nombres,apellidos,correo
import01,Nuevo,Uno,imp1@uide.edu.ec
import02,Nuevo,Dos,imp2@uide.edu.ec`;

    const previewRes = await request(app)
      .post('/api/miembros/importar')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archivo', Buffer.from(csvContent), 'valido.csv');
    
    assert.equal(previewRes.status, 200);
    const token = previewRes.body.previewToken;

    // 2. Confirmar
    const confirmRes = await request(app)
      .post('/api/miembros/importar/confirmar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ previewToken: token });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.filas_importadas, 2);

    // 3. Verificar en BD
    const [rows] = await pool.query('SELECT * FROM estudiante WHERE cedula IN ("import01", "import02")') as [any[], any];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].fk_id_institucion, institucionId);
    assert.equal(rows[1].fk_id_institucion, institucionId);
  });

  it('Admin B no puede importar usando institución A', async () => {
    // Como los endpoints usan req.user.fk_id_institucion, Admin B siempre
    // importará para su propia institución, a menos que intente engañar con
    // parámetros (que el backend ignora para admin).
    // Comprobamos que el preview usa el ID de la institución B, por tanto
    // si pide que el dominio sea @test.com, los de uide.edu.ec serán inválidos.
    const csvContent = `identificador,nombres,apellidos,correo
import03,Juan,X,x@uide.edu.ec`;

    const res = await request(app)
      .post('/api/miembros/importar')
      .set('Authorization', `Bearer ${adminBToken}`)
      .attach('archivo', Buffer.from(csvContent), 'test.csv');
    
    assert.equal(res.status, 200);
    assert.equal(res.body.validas, 0); // dominio incorrecto (B exige @test.com)
    assert.equal(res.body.invalidas, 1);
  });

  it('Puede listar el historial y descargar errores con aislamiento cruzado', async () => {
    // 1. Listar historial como Admin A
    const listRes = await request(app)
      .get('/api/miembros/importaciones')
      .set('Authorization', `Bearer ${adminToken}`);
    
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.length > 0);
    const idImportacion = listRes.body[0].id_importacion;

    // 2. Intentar ver historial como Admin B (no debería ver los de A)
    const listBRes = await request(app)
      .get('/api/miembros/importaciones')
      .set('Authorization', `Bearer ${adminBToken}`);
    
    assert.equal(listBRes.status, 200);
    assert.equal(listBRes.body.length, 0); // Admin B no ha hecho importaciones

    // 3. Intentar descargar errores de A siendo B (debe dar 404)
    const errRes = await request(app)
      .get(`/api/miembros/importaciones/${idImportacion}/errores`)
      .set('Authorization', `Bearer ${adminBToken}`);
    
    assert.equal(errRes.status, 404);
  });
});
