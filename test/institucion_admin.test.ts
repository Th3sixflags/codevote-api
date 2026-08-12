import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { registerRoutes } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { pool } from '../src/config/database.js';

const app = express();
app.use(express.json());
registerRoutes(app);
app.use(errorHandler);

describe('Asignación de Administradores a Institución', () => {
  let superadminToken: string;
  let adminToken: string;
  let institucionId: number;

  before(async () => {
    process.env.JWT_SECRET = 'secreto-de-prueba';
    const rnd = Date.now();

    // Create a test institution
    const [instResult] = await pool.query(
      'INSERT INTO institucion (nombre, slug, activo) VALUES (?, ?, 1)',
      [`Inst Test ${rnd}`, `inst-test-${rnd}`]
    ) as any;
    institucionId = instResult.insertId;

    // Superadmin token
    superadminToken = jwt.sign(
      { sub: `SA-${rnd}`, email: `super${rnd}@test.com`, rol: 'superadmin' },
      process.env.JWT_SECRET
    );

    // Admin token
    adminToken = jwt.sign(
      { sub: `AD-${rnd}`, email: `admin${rnd}@test.com`, rol: 'admin', fk_id_institucion: institucionId },
      process.env.JWT_SECRET
    );
  });

  after(async () => {
    // Teardown
    await pool.query('DELETE FROM estudiante WHERE correo_institucional LIKE "%@admin-test.com"');
    await pool.query('DELETE FROM institucion WHERE id_institucion = ?', [institucionId]);
    await pool.end();
  });

  it('SuperAdmin puede asignar un administrador', async () => {
    const res = await request(app)
      .post(`/api/instituciones/${institucionId}/admin`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        cedula: `111-${Date.now()}`,
        nombres: 'Nuevo',
        apellidos: 'Admin',
        correo_institucional: `nuevo-${Date.now()}@admin-test.com`
      });

    if (res.status !== 201) console.log(res.body);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.mensaje, 'Administrador asignado correctamente.');
    assert.strictEqual(res.body.admin.rol, 'admin');
  });

  it('Rechaza asignar admin si faltan datos', async () => {
    const res = await request(app)
      .post(`/api/instituciones/${institucionId}/admin`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        nombres: 'Falta Cedula y Correo'
      });

    assert.strictEqual(res.status, 422);
  });

  it('Falla si la cédula o correo ya existen', async () => {
    const cedula = `dup-123`;
    const correo = `dup-${Date.now()}@admin-test.com`;

    // Primera asignación exitosa
    const res1 = await request(app)
      .post(`/api/instituciones/${institucionId}/admin`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ cedula, nombres: 'Juan', apellidos: 'Perez', correo_institucional: correo });
    
    assert.strictEqual(res1.status, 201, JSON.stringify(res1.body));

    // Segunda asignación repetida
    const res = await request(app)
      .post(`/api/instituciones/${institucionId}/admin`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ cedula, nombres: 'Maria', apellidos: 'Gomez', correo_institucional: correo });

    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.ok(res.body.error.includes('registrados'));
  });

  it('Admin normal no puede usar esta ruta (requireSuperAdmin)', async () => {
    const res = await request(app)
      .post(`/api/instituciones/${institucionId}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        cedula: '123',
        nombres: 'Fake',
        apellidos: 'Admin',
        correo_institucional: 'fake@admin-test.com'
      });

    assert.strictEqual(res.status, 403);
  });
});
