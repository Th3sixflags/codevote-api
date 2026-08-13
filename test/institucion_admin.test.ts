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
  let otraInstitucionId: number;
  let cedulaMiembro: string;
  let cedulaAjena: string;
  let cedulaAdminCreado: string;
  let cedulaDuplicada: string;

  before(async () => {
    process.env.JWT_SECRET = 'secreto-de-prueba';
    const rnd = Date.now();

    // Create a test institution
    const [instResult] = await pool.query(
      'INSERT INTO institucion (nombre, slug, activo) VALUES (?, ?, 1)',
      [`Inst Test ${rnd}`, `inst-test-${rnd}`]
    ) as any;
    institucionId = instResult.insertId;
    const [otraInstResult] = await pool.query(
      'INSERT INTO institucion (nombre, slug, activo) VALUES (?, ?, 1)',
      [`Inst Ajena ${rnd}`, `inst-ajena-${rnd}`]
    ) as any;
    otraInstitucionId = otraInstResult.insertId;

    // `estudiante.cedula` admite hasta 20 caracteres. Las cédulas numéricas
    // mantienen la prueba fiel al formato de producción y evitan que un
    // Date.now() prefijado convierta el fixture en una cadena demasiado larga.
    const sufijo = String(rnd).slice(-8);
    cedulaMiembro = `98${sufijo}`;
    cedulaAjena = `97${sufijo}`;
    cedulaAdminCreado = `96${sufijo}`;
    cedulaDuplicada = `95${sufijo}`;
    await pool.query(
      `INSERT INTO estudiante (cedula, nombres, apellidos, correo_institucional, estado_academico, rol, fk_id_institucion, password, debe_cambiar_password)
       VALUES (?, 'Miembro', 'Local', ?, 'activo', 'estudiante', ?, '', 0),
              (?, 'Miembro', 'Ajeno', ?, 'activo', 'estudiante', ?, '', 0)`,
      [cedulaMiembro, `miembro-${rnd}@admin-test.com`, institucionId, cedulaAjena, `ajeno-${rnd}@admin-test.com`, otraInstitucionId]
    );

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
    // Limpieza exacta del fixture. No se usa un LIKE global: otras pruebas o
    // datos de desarrollo pueden tener correos similares y relaciones propias.
    const cedulas = [cedulaMiembro, cedulaAjena, cedulaAdminCreado, cedulaDuplicada];
    const referenciasDeEstudiante = [
      ['asignacion_candidatura', 'fk_cedula_estudiante'],
      ['codigo_voto', 'fk_cedula_estudiante'],
      ['notificacion', 'fk_cedula_estudiante'],
      ['codigo_acceso', 'fk_cedula_estudiante'],
      ['candidato', 'fk_cedula_estudiante'],
      ['lista_candidata', 'fk_cedula_responsable'],
      ['historial_importacion', 'cedula_importador'],
    ];
    const placeholders = cedulas.map(() => '?').join(', ');

    for (const [tabla, columna] of referenciasDeEstudiante) {
      await pool.query(`DELETE FROM ${tabla} WHERE ${columna} IN (${placeholders})`, cedulas);
    }
    await pool.query(
      `DELETE FROM estudiante WHERE cedula IN (${placeholders})`,
      cedulas
    );
    await pool.query('DELETE FROM institucion WHERE id_institucion IN (?, ?)', [institucionId, otraInstitucionId]);
    await pool.end();
  });

  it('SuperAdmin puede asignar un administrador', async () => {
    const res = await request(app)
      .post(`/api/instituciones/${institucionId}/admin`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        cedula: cedulaAdminCreado,
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
    const cedula = cedulaDuplicada;
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

  it('el selector de miembros solo lista usuarios de la institución elegida', async () => {
    const res = await request(app)
      .get(`/api/instituciones/${institucionId}/miembros`)
      .set('Authorization', `Bearer ${superadminToken}`);

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.some((miembro: any) => miembro.cedula === cedulaMiembro));
    assert.ok(!res.body.some((miembro: any) => miembro.cedula === cedulaAjena));
  });

  it('SuperAdmin promueve únicamente a un miembro activo de la institución elegida', async () => {
    const res = await request(app)
      .patch(`/api/instituciones/${institucionId}/miembros/${cedulaMiembro}/administrador`)
      .set('Authorization', `Bearer ${superadminToken}`);

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.admin.cedula, cedulaMiembro);
    assert.strictEqual(res.body.admin.rol, 'admin');
  });

  it('no permite promover miembros de otra institución', async () => {
    const res = await request(app)
      .patch(`/api/instituciones/${institucionId}/miembros/${cedulaAjena}/administrador`)
      .set('Authorization', `Bearer ${superadminToken}`);

    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });
});
