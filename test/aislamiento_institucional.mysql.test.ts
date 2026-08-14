/** Integración real contra MySQL: aislamiento A/B e integridad referencial tenant. */
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { pool } from '../src/config/database.js';
import * as estudianteService from '../src/services/estudiante.service.js';
import * as facultadService from '../src/services/facultad.service.js';
import * as directorService from '../src/services/director.service.js';
import * as carreraService from '../src/services/carrera.service.js';
import * as votoRepo from '../src/repositories/voto.repository.js';
import * as cierreRepo from '../src/repositories/cierre_votacion.repository.js';
import * as estudianteRepo from '../src/repositories/estudiante.repository.js';
import * as codigoRepo from '../src/repositories/codigo_acceso.repository.js';
import * as sesiones from '../src/repositories/sesion.repository.js';
import { randomUUID } from 'node:crypto';

const sufijo = String(Date.now()).slice(-8);
let instA = 0;
let instB = 0;
let facultadA = 0;
let directorA = 0;
let carreraA = 0;
let facultadB = 0;
let directorB = 0;
let carreraB = 0;
const adminA = `admA${sufijo}`;
const adminB = `admB${sufijo}`;
const estudianteB = `estB${sufijo}`;
const personaCompartida = `per${sufijo}`;

before(async () => {
  const [a] = await pool.query(
    `INSERT INTO institucion (nombre, slug, tipo, activo) VALUES (?, ?, 'universidad', 1)`,
    [`Institución A ${sufijo}`, `inst-a-${sufijo}`]
  ) as [any, any];
  const [b] = await pool.query(
    `INSERT INTO institucion (nombre, slug, tipo, activo) VALUES (?, ?, 'universidad', 1)`,
    [`Institución B ${sufijo}`, `inst-b-${sufijo}`]
  ) as [any, any];
  instA = Number(a.insertId);
  instB = Number(b.insertId);

  facultadA = Number((await facultadService.crearFacultad({ nombre_facultad: 'FA' }, instA)).id_facultad);
  facultadB = Number((await facultadService.crearFacultad({ nombre_facultad: 'FB' }, instB)).id_facultad);
  directorA = Number((await directorService.crearDirector({ nombres: 'Dir', apellidos: 'A', correo: `da${sufijo}@test.dev` }, instA)).id_director);
  directorB = Number((await directorService.crearDirector({ nombres: 'Dir', apellidos: 'B', correo: `db${sufijo}@test.dev` }, instB)).id_director);
  carreraA = Number((await carreraService.crearCarrera({ nombre_carrera: 'CA', fk_id_facultad: facultadA, fk_id_director: directorA }, instA)).id_carrera);
  carreraB = Number((await carreraService.crearCarrera({ nombre_carrera: 'CB', fk_id_facultad: facultadB, fk_id_director: directorB }, instB)).id_carrera);

  await estudianteService.crearEstudiante({ cedula: adminA, nombres: 'Admin', apellidos: 'A', correo_institucional: `aa${sufijo}@test.dev`, rol: 'admin' }, instA);
  await estudianteService.crearEstudiante({ cedula: adminB, nombres: 'Admin', apellidos: 'B', correo_institucional: `ab${sufijo}@test.dev`, rol: 'admin' }, instB);
  await estudianteService.crearEstudiante({ cedula: estudianteB, nombres: 'Est', apellidos: 'B', correo_institucional: `eb${sufijo}@test.dev`, fk_id_carrera: carreraB }, instB);
  await estudianteService.crearEstudiante({ cedula: personaCompartida, nombres: 'Persona', apellidos: 'Compartida', correo_institucional: `pa${sufijo}@test.dev`, fk_id_carrera: carreraA }, instA);
  await estudianteService.crearEstudiante({ cedula: personaCompartida, nombres: 'Persona', apellidos: 'Compartida', correo_institucional: `pb${sufijo}@test.dev`, fk_id_carrera: carreraB }, instB);
});

after(async () => {
  await pool.query('DELETE FROM estudiante WHERE cedula IN (?, ?, ?, ?)', [adminA, adminB, estudianteB, personaCompartida]);
  await pool.query('DELETE FROM carrera WHERE id_carrera IN (?, ?)', [carreraA, carreraB]);
  await pool.query('DELETE FROM director WHERE id_director IN (?, ?)', [directorA, directorB]);
  await pool.query('DELETE FROM facultad WHERE id_facultad IN (?, ?)', [facultadA, facultadB]);
  await pool.query('DELETE FROM institucion WHERE id_institucion IN (?, ?)', [instA, instB]);
});

test('CRUD de estudiantes no lee, edita ni elimina otra institución', async () => {
  assert.equal(await estudianteService.obtenerEstudiante(estudianteB, instA), null);
  assert.equal(await estudianteService.actualizarEstudiante(estudianteB, { nombres: 'Intruso' }, instA), null);
  assert.equal(await estudianteService.eliminarEstudiante(estudianteB, instA), false);
  assert.equal((await estudianteService.obtenerEstudiante(estudianteB, instB))?.nombres, 'Est');
});

test('el alta toma la institución de la sesión y rechaza carrera cruzada', async () => {
  await assert.rejects(
    estudianteService.crearEstudiante({
      cedula: `cross${sufijo}`, nombres: 'Cross', apellidos: 'Tenant',
      correo_institucional: `cross${sufijo}@test.dev`, fk_id_carrera: carreraB,
    }, instA),
    /no pertenece a tu institución/
  );
});

test('facultades, directores y carreras están aislados en lectura y mutación', async () => {
  assert.equal(await facultadService.obtenerFacultad(facultadB, instA), null);
  assert.equal(await directorService.actualizarDirector(directorB, { nombres: 'Intruso' }, instA), null);
  assert.equal(await carreraService.eliminarCarrera(carreraB, instA), false);
  await assert.rejects(
    carreraService.crearCarrera({ nombre_carrera: 'Cruce', fk_id_facultad: facultadB }, instA),
    /no pertenece a tu institución/
  );
});

test('padrón y administradores de cierre filtran por institución', async () => {
  assert.equal(await votoRepo.countHabilitados(null, instA), 1);
  assert.equal(await votoRepo.countHabilitados(null, instB), 2);
  assert.deepEqual((await cierreRepo.administradoresActivos(instA)).map((a) => a.cedula), [adminA]);
  assert.deepEqual((await cierreRepo.administradoresActivos(instB)).map((a) => a.cedula), [adminB]);
});

test('el buscador de integrantes del portal candidato no cruza instituciones', async () => {
  assert.deepEqual(await estudianteRepo.buscarPosiblesIntegrantes(null, 'Est', instA), []);
  assert.deepEqual(
    (await estudianteRepo.buscarPosiblesIntegrantes(null, 'Est', instB)).map((e) => e.cedula),
    [estudianteB]
  );
});

test('una misma persona puede tener membresías independientes en dos instituciones', async () => {
  const miembroA = await estudianteService.obtenerEstudiante(personaCompartida, instA);
  const miembroB = await estudianteService.obtenerEstudiante(personaCompartida, instB);
  assert.equal(miembroA?.correo_institucional, `pa${sufijo}@test.dev`);
  assert.equal(miembroB?.correo_institucional, `pb${sufijo}@test.dev`);
  assert.equal(miembroA?.fk_id_carrera, carreraA);
  assert.equal(miembroB?.fk_id_carrera, carreraB);
  assert.equal((await estudianteService.listarEstudiantes(instA)).some((e) => e.cedula === personaCompartida), true);
  assert.equal((await estudianteService.listarEstudiantes(instB)).some((e) => e.cedula === personaCompartida), true);
  await assert.rejects(
    estudianteService.crearEstudiante({
      cedula: personaCompartida, nombres: 'Persona', apellidos: 'Duplicada',
      correo_institucional: `pa2${sufijo}@test.dev`, fk_id_carrera: carreraA,
    }, instA),
    /ya pertenece a esta institución/
  );
});

test('el login por cédula devuelve dos tenants, selecciona por slug y no cruza la sesión', async () => {
  const cuentas = await codigoRepo.buscarCuentasActivas(personaCompartida);
  assert.deepEqual(
    cuentas.map((cuenta: any) => cuenta.institucion_slug).sort(),
    [`inst-a-${sufijo}`, `inst-b-${sufijo}`].sort()
  );
  const cuentaB = (await codigoRepo.buscarCuentasActivas(personaCompartida, `inst-b-${sufijo}`))[0] as any;
  assert.equal(Number(cuentaB.fk_id_institucion), instB);
  assert.equal(cuentaB.correo_institucional, `pb${sufijo}@test.dev`);

  const idSesion = randomUUID();
  await sesiones.crearSiEstaDisponible({
    idSesion, cedula: personaCompartida, institucionId: instB,
    expiraAt: new Date(Date.now() + 60_000), ip: null, userAgent: 'test',
  });
  assert.equal(await sesiones.estaActiva(idSesion, personaCompartida, instB), true);
  assert.equal(await sesiones.estaActiva(idSesion, personaCompartida, instA), false);
  await sesiones.revocar(idSesion, personaCompartida);
});
