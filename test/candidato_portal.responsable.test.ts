/**
 * Contrato del Portal del candidato tras la regla del RESPONSABLE.
 *
 * Regla: solo el responsable de la candidatura tiene rol 'candidato' y acceso a
 * /api/candidato/*. Es, además, el Presidente de su lista. Los demás
 * integrantes se registran en la tabla `candidato` pero conservan
 * `rol = 'estudiante'`, sin asignación de candidatura ni acceso al portal.
 *
 * La base de datos se sustituye por un doble en memoria que responde según la
 * forma de cada consulta, así que las pruebas ejercitan el SQL real de los
 * repositorios y toda la lógica de los servicios, sin necesitar MySQL.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import portalRoutes from '../src/routes/candidato_portal.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { estadoVacio, instalarDoble, type Estado } from './_dobleMysql.js';

const PRESIDENTE = '1710000017'; // responsable de la lista 1 (rol candidato)
const VOCAL      = '1710000025'; // integrante de la lista 1 (rol estudiante)
const OTRO_CAND  = '1710000058'; // responsable de otra lista
const LIBRE      = '1710000108'; // estudiante sin candidatura

let estado: Estado;
let restaurar: () => void;

const app = express();
app.use(express.json());
app.use('/api/candidato', portalRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const token = (sub: string, rol: string) =>
  jwt.sign({ sub, email: `${sub}@uide.edu.ec`, rol }, process.env.JWT_SECRET!);

const tokenPresidente = token(PRESIDENTE, 'candidato');
const tokenOtroCand   = token(OTRO_CAND, 'candidato');
const tokenIntegrante = token(VOCAL, 'estudiante');

/** Escenario base: un proceso en inscripción, una papeleta y una lista con presidente. */
function sembrar(): Estado {
  const e = estadoVacio();
  e.procesos = [{ id_proceso: 1, nombre_proceso: 'Consejo Estudiantil 2026', estado: 'inscripcion' }];
  e.votaciones = [
    { id_votacion: 1, titulo_papeleta: 'Consejo Estudiantil', estado: 'pendiente', fk_id_carrera: null, id_proceso: 1 },
    { id_votacion: 2, titulo_papeleta: 'Representante de carrera', estado: 'pendiente', fk_id_carrera: null, id_proceso: 1 },
  ];
  e.estudiantes = [
    { cedula: PRESIDENTE, nombres: 'María',  apellidos: 'González', rol: 'candidato',  promedio: 92, id_carrera: 1 },
    { cedula: VOCAL,      nombres: 'Carlos', apellidos: 'Pérez',    rol: 'estudiante', promedio: 90, id_carrera: 1 },
    { cedula: OTRO_CAND,  nombres: 'Sofía',  apellidos: 'Mendoza',  rol: 'candidato',  promedio: 95, id_carrera: 1 },
    { cedula: LIBRE,      nombres: 'Javier', apellidos: 'Cordero',  rol: 'estudiante', promedio: 88, id_carrera: 1 },
  ];
  e.asignaciones = [
    { fk_cedula_estudiante: PRESIDENTE, fk_id_votacion: 1, estado: 'activa' },
    { fk_cedula_estudiante: OTRO_CAND,  fk_id_votacion: 2, estado: 'activa' },
  ];
  e.listas = [{
    id_lista: 1, nombre_lista: 'Innovación UIDE', estado_revision: 'pendiente',
    fk_cedula_responsable: PRESIDENTE, fk_id_votacion: 1, id_proceso: 1,
    estado_proceso: 'inscripcion', carrera_votacion: null,
  }];
  e.candidatos = [
    { id_candidato: 10, cargo: 'Presidente', fk_cedula_estudiante: PRESIDENTE, fk_id_lista: 1 },
    { id_candidato: 11, cargo: 'Vocal',      fk_cedula_estudiante: VOCAL,      fk_id_lista: 1 },
  ];
  return e;
}

async function pedir(ruta: string, opciones: { metodo?: string; token?: string; cuerpo?: any } = {}) {
  const respuesta = await fetch(`${baseUrl}/api/candidato${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: {
      Authorization: `Bearer ${opciones.token ?? tokenPresidente}`,
      'Content-Type': 'application/json',
    },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

before(async () => {
  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  restaurar?.();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

beforeEach(() => {
  restaurar?.();
  estado = sembrar();
  restaurar = instalarDoble(pool, estado);
});

// ---------------------------------------------------------------------------

test('crear lista como candidato lo registra automáticamente como presidente', async () => {
  // Otro candidato, con asignación en la papeleta 2 y todavía sin lista.
  estado.candidatos = estado.candidatos.filter((c) => c.fk_cedula_estudiante !== OTRO_CAND);

  const { estado: http, cuerpo } = await pedir('/listas', {
    metodo: 'POST', token: tokenOtroCand, cuerpo: { nombre_lista: 'Unidad Estudiantil' },
  });

  assert.equal(http, 201);
  assert.equal(cuerpo.fk_cedula_responsable, OTRO_CAND, 'la cédula del responsable no quedó en la lista');

  const nueva = estado.listas.find((l) => l.nombre_lista === 'Unidad Estudiantil')!;
  const presidente = estado.candidatos.find((c) => c.fk_id_lista === nueva.id_lista && c.cargo === 'Presidente');
  assert.ok(presidente, 'no se insertó al responsable como integrante');
  assert.equal(presidente!.fk_cedula_estudiante, OTRO_CAND);

  // La lista y su presidente se crean dentro de una transacción.
  assert.deepEqual(estado.transaccion, ['BEGIN', 'COMMIT']);
});

test('agregar un integrante lo deja con rol estudiante y sin asignación', async () => {
  const { estado: http, cuerpo } = await pedir('/listas/1/candidatos', {
    metodo: 'POST',
    cuerpo: { cargo: 'Secretario', fk_cedula_estudiante: LIBRE },
  });

  assert.equal(http, 201);
  assert.equal(cuerpo.cargo, 'Secretario');
  assert.equal(cuerpo.es_responsable, false);

  // Lo esencial: el integrante NO cambia de rol ni recibe asignación.
  assert.equal(estado.estudiantes.find((e) => e.cedula === LIBRE)!.rol, 'estudiante');
  assert.equal(estado.asignaciones.some((a) => a.fk_cedula_estudiante === LIBRE), false);
  assert.equal(
    estado.sentencias.some((s) => s.startsWith('UPDATE estudiante') || s.startsWith('INSERT INTO asignacion_candidatura')),
    false,
    'agregar un integrante no debe tocar roles ni asignaciones'
  );
});

test('el integrante no puede entrar al Portal del candidato', async () => {
  const { estado: http, cuerpo } = await pedir('/mi-lista', { token: tokenIntegrante });

  assert.equal(http, 403);
  assert.match(cuerpo.error, /rol candidato/i);
});

test('otro candidato no puede modificar una lista ajena: 403', async () => {
  const agregar = await pedir('/listas/1/candidatos', {
    metodo: 'POST', token: tokenOtroCand,
    cuerpo: { cargo: 'Tesorero', fk_cedula_estudiante: LIBRE },
  });
  assert.equal(agregar.estado, 403);

  const editar = await pedir('/listas/1', {
    metodo: 'PATCH', token: tokenOtroCand, cuerpo: { nombre_lista: 'Secuestrada' },
  });
  assert.equal(editar.estado, 403);

  const eliminar = await pedir('/candidatos/11', { metodo: 'DELETE', token: tokenOtroCand });
  assert.equal(eliminar.estado, 403);

  const revision = await pedir('/listas/1/enviar-revision', { metodo: 'POST', token: tokenOtroCand });
  assert.equal(revision.estado, 403);
});

test('no se puede agregar un segundo presidente: 409', async () => {
  const { estado: http, cuerpo } = await pedir('/listas/1/candidatos', {
    metodo: 'POST', cuerpo: { cargo: 'Presidente', fk_cedula_estudiante: LIBRE },
  });

  assert.equal(http, 409);
  assert.match(cuerpo.error, /Presidente/);
  assert.equal(estado.candidatos.filter((c) => c.fk_id_lista === 1 && c.cargo === 'Presidente').length, 1);
});

test('tampoco se asciende a presidente editando el cargo de un integrante: 409', async () => {
  const { estado: http } = await pedir('/candidatos/11', {
    metodo: 'PATCH', cuerpo: { cargo: 'Presidente' },
  });

  assert.equal(http, 409);
  assert.equal(estado.candidatos.find((c) => c.id_candidato === 11)!.cargo, 'Vocal');
});

test('no se puede eliminar al responsable desde el portal: 409', async () => {
  const { estado: http, cuerpo } = await pedir('/candidatos/10', { metodo: 'DELETE' });

  assert.equal(http, 409);
  assert.match(cuerpo.error, /responsable/i);
  assert.ok(estado.candidatos.some((c) => c.id_candidato === 10), 'el presidente fue eliminado');
});

test('el responsable no puede cambiar su propio cargo desde el portal: 409', async () => {
  const { estado: http } = await pedir('/candidatos/10', {
    metodo: 'PATCH', cuerpo: { cargo: 'Vocal' },
  });

  assert.equal(http, 409);
  assert.equal(estado.candidatos.find((c) => c.id_candidato === 10)!.cargo, 'Presidente');
});

test('un integrante no puede participar en dos listas activas: 409', async () => {
  // VOCAL ya integra la lista 1; el responsable de otra lista intenta ficharlo.
  estado.listas.push({
    id_lista: 2, nombre_lista: 'Unidad Estudiantil', estado_revision: 'pendiente',
    fk_cedula_responsable: OTRO_CAND, fk_id_votacion: 2, id_proceso: 1,
    estado_proceso: 'inscripcion', carrera_votacion: null,
  });
  estado.candidatos.push({ id_candidato: 20, cargo: 'Presidente', fk_cedula_estudiante: OTRO_CAND, fk_id_lista: 2 });

  const { estado: http, cuerpo } = await pedir('/listas/2/candidatos', {
    metodo: 'POST', token: tokenOtroCand,
    cuerpo: { cargo: 'Secretario', fk_cedula_estudiante: VOCAL },
  });

  assert.equal(http, 409);
  assert.match(cuerpo.error, /otra lista|candidatura activa/i);
});

test('un responsable de otra candidatura no puede ser integrante de esta lista: 409', async () => {
  // OTRO_CAND tiene asignación activa: es responsable de su propia candidatura.
  estado.candidatos = estado.candidatos.filter((c) => c.fk_cedula_estudiante !== OTRO_CAND);

  const { estado: http, cuerpo } = await pedir('/listas/1/candidatos', {
    metodo: 'POST', cuerpo: { cargo: 'Tesorero', fk_cedula_estudiante: OTRO_CAND },
  });

  assert.equal(http, 409);
  assert.match(cuerpo.error, /responsable de otra candidatura/i);
});

test('GET /candidato/mi-lista devuelve responsable e integrantes con es_responsable', async () => {
  const { estado: http, cuerpo } = await pedir('/mi-lista');

  assert.equal(http, 200);
  assert.equal(cuerpo.fk_cedula_responsable, PRESIDENTE);
  assert.deepEqual(cuerpo.responsable, {
    cedula: PRESIDENTE, nombres: 'María', apellidos: 'González',
  });

  assert.equal(cuerpo.integrantes.length, 2);
  const presidente = cuerpo.integrantes[0];
  assert.equal(presidente.cedula, PRESIDENTE);
  assert.equal(presidente.cargo, 'Presidente');
  assert.equal(presidente.es_responsable, true, 'el presidente debe venir marcado como responsable');
  assert.equal(cuerpo.integrantes[1].es_responsable, false);

  // Compatibilidad: `candidatos` sigue presente con el mismo contenido.
  assert.deepEqual(cuerpo.candidatos, cuerpo.integrantes);
});

test('el cargo se acepta en minúsculas y se normaliza a la forma capitalizada', async () => {
  const { estado: http, cuerpo } = await pedir('/listas/1/candidatos', {
    metodo: 'POST', cuerpo: { cargo: 'vicepresidente', fk_cedula_estudiante: LIBRE },
  });

  assert.equal(http, 201);
  assert.equal(cuerpo.cargo, 'Vicepresidente');
});
