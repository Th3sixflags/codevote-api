/**
 * PATCH /api/listas-candidatas/:id/responsable — transferencia de la
 * responsabilidad (y de la presidencia) de una lista.
 *
 * Es la ÚNICA vía para cambiar al presidente: desde el Portal del candidato
 * está bloqueado. Debe ocurrir dentro de una transacción y dejar consistentes
 * la lista, los integrantes, las asignaciones de candidatura y los roles.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import listaRoutes from '../src/routes/lista_candidata.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { estadoVacio, instalarDoble, type Estado } from './_dobleMysql.js';

const ANTERIOR = '1710000017'; // responsable actual (rol candidato)
const NUEVO    = '1710000025'; // integrante que asumirá la presidencia
const EXTERNO  = '1710000108'; // estudiante que aún no integra la lista
const AJENO    = '1710000058'; // ya participa en otra candidatura activa

let estado: Estado;
let restaurar: () => void;

const app = express();
app.use(express.json());
app.use('/api/listas-candidatas', listaRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const tokenAdmin = jwt.sign(
  { sub: '1710000009', email: 'schininin@uide.edu.ec', rol: 'admin' },
  process.env.JWT_SECRET!
);
const tokenCandidato = jwt.sign(
  { sub: ANTERIOR, email: 'mgonzalez@uide.edu.ec', rol: 'candidato' },
  process.env.JWT_SECRET!
);

function sembrar(): Estado {
  const e = estadoVacio();
  e.procesos = [{ id_proceso: 1, nombre_proceso: 'Consejo Estudiantil 2026', estado: 'inscripcion' }];
  e.votaciones = [
    { id_votacion: 1, titulo_papeleta: 'Consejo Estudiantil', estado: 'pendiente', fk_id_carrera: null, id_proceso: 1 },
    { id_votacion: 2, titulo_papeleta: 'Otra papeleta', estado: 'pendiente', fk_id_carrera: null, id_proceso: 1 },
  ];
  e.estudiantes = [
    { cedula: ANTERIOR, nombres: 'María',  apellidos: 'González', rol: 'candidato',  promedio: 92, id_carrera: 1 },
    { cedula: NUEVO,    nombres: 'Carlos', apellidos: 'Pérez',    rol: 'estudiante', promedio: 90, id_carrera: 1 },
    { cedula: EXTERNO,  nombres: 'Javier', apellidos: 'Cordero',  rol: 'estudiante', promedio: 88, id_carrera: 1 },
    { cedula: AJENO,    nombres: 'Sofía',  apellidos: 'Mendoza',  rol: 'candidato',  promedio: 95, id_carrera: 1 },
  ];
  e.asignaciones = [
    { fk_cedula_estudiante: ANTERIOR, fk_id_votacion: 1, estado: 'activa' },
    { fk_cedula_estudiante: AJENO,    fk_id_votacion: 2, estado: 'activa' },
  ];
  e.listas = [
    {
      id_lista: 1, nombre_lista: 'Innovación UIDE', estado_revision: 'pendiente',
      fk_cedula_responsable: ANTERIOR, fk_id_votacion: 1, id_proceso: 1,
      estado_proceso: 'inscripcion', carrera_votacion: null,
    },
    {
      id_lista: 2, nombre_lista: 'Unidad Estudiantil', estado_revision: 'pendiente',
      fk_cedula_responsable: AJENO, fk_id_votacion: 2, id_proceso: 1,
      estado_proceso: 'inscripcion', carrera_votacion: null,
    },
  ];
  e.candidatos = [
    { id_candidato: 10, cargo: 'Presidente', fk_cedula_estudiante: ANTERIOR, fk_id_lista: 1 },
    { id_candidato: 11, cargo: 'Vocal',      fk_cedula_estudiante: NUEVO,    fk_id_lista: 1 },
    { id_candidato: 20, cargo: 'Presidente', fk_cedula_estudiante: AJENO,    fk_id_lista: 2 },
  ];
  return e;
}

async function transferir(cedula: string, token = tokenAdmin, listaId = 1) {
  const respuesta = await fetch(`${baseUrl}/api/listas-candidatas/${listaId}/responsable`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cedula_nuevo_responsable: cedula }),
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

test('el admin transfiere la responsabilidad de forma transaccional', async () => {
  const { estado: http, cuerpo } = await transferir(NUEVO);

  assert.equal(http, 200);
  assert.equal(cuerpo.fk_cedula_responsable, NUEVO);
  assert.deepEqual(cuerpo.responsable, { cedula: NUEVO, nombres: 'Carlos', apellidos: 'Pérez' });

  // 1. La lista apunta al nuevo responsable y él es el Presidente.
  assert.equal(estado.listas[0].fk_cedula_responsable, NUEVO);
  const presidentes = estado.candidatos.filter((c) => c.fk_id_lista === 1 && c.cargo === 'Presidente');
  assert.equal(presidentes.length, 1, 'debe quedar exactamente un presidente');
  assert.equal(presidentes[0].fk_cedula_estudiante, NUEVO);

  // 2. El anterior sigue en la lista, pero ya no como presidente.
  assert.equal(estado.candidatos.find((c) => c.id_candidato === 10)!.cargo, 'Vocal');

  // 3. Asignaciones y roles intercambiados.
  assert.equal(estado.asignaciones.find((a) => a.fk_cedula_estudiante === NUEVO)?.fk_id_votacion, 1);
  assert.equal(estado.asignaciones.some((a) => a.fk_cedula_estudiante === ANTERIOR), false);
  assert.equal(estado.estudiantes.find((e) => e.cedula === NUEVO)!.rol, 'candidato');
  assert.equal(estado.estudiantes.find((e) => e.cedula === ANTERIOR)!.rol, 'estudiante');

  // 4. Todo dentro de una transacción confirmada.
  assert.deepEqual(estado.transaccion, ['BEGIN', 'COMMIT']);
});

test('si el nuevo responsable no era integrante, se le inserta como Presidente', async () => {
  const { estado: http } = await transferir(EXTERNO);

  assert.equal(http, 200);
  const presidente = estado.candidatos.find((c) => c.fk_id_lista === 1 && c.cargo === 'Presidente')!;
  assert.equal(presidente.fk_cedula_estudiante, EXTERNO);
  assert.equal(estado.estudiantes.find((e) => e.cedula === EXTERNO)!.rol, 'candidato');
});

test('los cargos se intercambian: el anterior hereda el del nuevo responsable', async () => {
  // El nuevo responsable es el Secretario y la lista ya tiene un Vocal: bajar al
  // presidente anterior a Vocal duplicaría el cargo, así que hereda Secretario.
  estado.candidatos.find((c) => c.id_candidato === 11)!.cargo = 'Secretario';
  estado.candidatos.push({ id_candidato: 12, cargo: 'Vocal', fk_cedula_estudiante: EXTERNO, fk_id_lista: 1 });

  const { estado: http } = await transferir(NUEVO);

  assert.equal(http, 200);
  assert.equal(estado.candidatos.find((c) => c.id_candidato === 11)!.cargo, 'Presidente');
  assert.equal(estado.candidatos.find((c) => c.id_candidato === 10)!.cargo, 'Secretario');
  assert.equal(estado.candidatos.find((c) => c.id_candidato === 12)!.cargo, 'Vocal');

  const cargos = estado.candidatos.filter((c) => c.fk_id_lista === 1).map((c) => c.cargo);
  assert.equal(new Set(cargos).size, cargos.length, 'ningún cargo puede repetirse en la lista');
});

test('lista con los cinco cargos ocupados: no se transfiere a alguien de fuera (409)', async () => {
  const lleno = ['Vicepresidente', 'Secretario', 'Tesorero', 'Vocal'];
  estado.candidatos = estado.candidatos.filter((c) => c.fk_id_lista !== 1 || c.cargo === 'Presidente');
  lleno.forEach((cargo, i) => {
    const cedula = i === 0 ? NUEVO : `171000010${i}`;
    estado.estudiantes.push({ cedula, nombres: `N${i}`, apellidos: `A${i}`, rol: 'estudiante', promedio: 90, id_carrera: 1 });
    estado.candidatos.push({ id_candidato: 30 + i, cargo, fk_cedula_estudiante: cedula, fk_id_lista: 1 });
  });

  const { estado: http, cuerpo } = await transferir(EXTERNO);

  assert.equal(http, 409);
  assert.match(cuerpo.error, /cinco cargos/i);
  assert.equal(estado.listas[0].fk_cedula_responsable, ANTERIOR);
  assert.deepEqual(estado.transaccion, [], 'ni siquiera se abre la transacción');
});

test('un fallo a mitad de la transferencia hace rollback y no deja nada a medias', async () => {
  // El doble revienta justo al insertar/actualizar la asignación del nuevo.
  restaurar();
  restaurar = instalarDoble(pool, estado, (sql) => {
    if (sql.startsWith('INSERT INTO asignacion_candidatura')) {
      throw new Error('fallo simulado de la base');
    }
    return undefined;
  });

  const { estado: http } = await transferir(NUEVO);

  assert.equal(http, 500);
  assert.deepEqual(estado.transaccion, ['BEGIN', 'ROLLBACK'], 'debe deshacerse la transacción');
  // El rol del anterior no llegó a tocarse: el rollback real lo revierte todo.
  assert.equal(estado.estudiantes.find((e) => e.cedula === ANTERIOR)!.rol, 'candidato');
});

test('un candidato no puede transferir la responsabilidad: 403', async () => {
  const { estado: http } = await transferir(NUEVO, tokenCandidato);

  assert.equal(http, 403);
  assert.equal(estado.listas[0].fk_cedula_responsable, ANTERIOR);
  assert.deepEqual(estado.transaccion, []);
});

test('no se transfiere a quien ya participa en otra candidatura activa: 409', async () => {
  const { estado: http, cuerpo } = await transferir(AJENO);

  assert.equal(http, 409);
  assert.match(cuerpo.error, /candidatura/i);
  assert.equal(estado.listas[0].fk_cedula_responsable, ANTERIOR);
});

test('no se transfiere a quien ya es el responsable: 409', async () => {
  const { estado: http } = await transferir(ANTERIOR);

  assert.equal(http, 409);
  assert.deepEqual(estado.transaccion, []);
});

test('cédula inexistente: 404', async () => {
  const { estado: http } = await transferir('1710000181');
  assert.equal(http, 404);
});
