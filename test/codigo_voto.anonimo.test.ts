/**
 * Ningún endpoint de administración de comprobantes debe revelar quién votó.
 *
 * Cubre los tres que ve un admin:
 *   GET /api/codigos-voto
 *   GET /api/codigos-voto/:id
 *   GET /api/codigos-voto/votacion/:votacionId
 *
 * Sirven para auditar cuántos comprobantes se emitieron y en qué estado están,
 * no para saber quién participó ni qué eligió. Estas pruebas fijan ese contrato
 * para que un cambio futuro en la consulta o en el servicio no vuelva a filtrar
 * la identidad sin que nadie se entere.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import codigoVotoRoutes from '../src/routes/codigo_voto.routes.js';

/**
 * Fila tal como podría venir de MySQL si alguien ampliara la consulta: trae
 * todos los campos sensibles. Si el servicio dejara de filtrar, saldrían por la
 * respuesta y estas pruebas fallarían.
 */
const FILA_CON_DATOS_SENSIBLES = {
  id_codigo: 1,
  titulo_papeleta: 'Presidencia 2026',
  codigo_hash: 'a1b2c3d4e5f6',
  codigo_verificacion: '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f',
  estado_codigo: 'usado',
  fecha_envio: '2026-07-01 08:00:00',
  fk_cedula_estudiante: '1105946139',
  nombres: 'Anyela Carolina',
  apellidos: 'Carpio Torres',
  correo_institucional: 'ancarpioto@uide.edu.ec',
  fk_id_lista: 7,
  nombre_lista: 'Lista B',
  fk_id_candidato: 3,
  nombre_candidato: 'Felix Rodas',
  opcion_votada: 'Lista B',
};

/** Lo único que puede salir. */
const CAMPOS_ESPERADOS = [
  'id_codigo',
  'titulo_papeleta',
  'codigo_hash',
  'codigo_verificacion',
  'estado_codigo',
  'fecha_envio',
];

/** Campos que jamás pueden salir por un endpoint de admin. */
const CAMPOS_PROHIBIDOS = [
  'fk_cedula_estudiante',
  'cedula',
  'nombres',
  'apellidos',
  'nombre_completo',
  'correo_institucional',
  'correo',
  'fk_id_lista',
  'nombre_lista',
  'fk_id_candidato',
  'nombre_candidato',
  'opcion_votada',
];

/** Los tres endpoints que un admin puede consultar. */
const ENDPOINTS_DE_ADMIN = [
  { nombre: 'GET /codigos-voto',                  ruta: '/api/codigos-voto',              esListado: true  },
  { nombre: 'GET /codigos-voto/:id',              ruta: '/api/codigos-voto/1',            esListado: false },
  { nombre: 'GET /codigos-voto/votacion/:id',     ruta: '/api/codigos-voto/votacion/1',   esListado: true  },
];

const queryOriginal = pool.query.bind(pool);
const consultasEjecutadas: string[] = [];

const app = express();
app.use(express.json());
app.use('/api/codigos-voto', codigoVotoRoutes);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const tokenAdmin = jwt.sign(
  { sub: '1710000009', email: 'schininin@uide.edu.ec', rol: 'admin', fk_id_institucion: 1 },
  process.env.JWT_SECRET!
);

before(async () => {
  // Se sustituye la consulta a MySQL: la prueba no necesita base de datos, y
  // así se controla exactamente qué "trae" la fila.
  (pool as any).query = async (sql: string) => {
    consultasEjecutadas.push(sql);
    return [[FILA_CON_DATOS_SENSIBLES], []];
  };

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      const { port } = servidor.address() as { port: number };
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  (pool as any).query = queryOriginal;
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

async function pedirComoAdmin(ruta: string) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

for (const endpoint of ENDPOINTS_DE_ADMIN) {
  test(`${endpoint.nombre} no devuelve identidad ni la eleccion`, async () => {
    const { estado, cuerpo } = await pedirComoAdmin(endpoint.ruta);

    assert.equal(estado, 200);
    const comprobantes = endpoint.esListado ? cuerpo : [cuerpo];
    assert.ok(comprobantes.length > 0, 'se esperaba al menos un comprobante');

    for (const comprobante of comprobantes) {
      for (const campo of CAMPOS_PROHIBIDOS) {
        assert.ok(
          !(campo in comprobante),
          `${endpoint.nombre} expone "${campo}" a un administrador`
        );
      }
    }
  });

  test(`${endpoint.nombre} devuelve solo los campos acordados`, async () => {
    const { cuerpo } = await pedirComoAdmin(endpoint.ruta);
    const comprobantes = endpoint.esListado ? cuerpo : [cuerpo];

    for (const comprobante of comprobantes) {
      assert.deepEqual(
        Object.keys(comprobante).sort(),
        [...CAMPOS_ESPERADOS].sort(),
        `${endpoint.nombre} devuelve un juego de campos distinto al acordado`
      );
    }
  });

  test(`${endpoint.nombre} no filtra datos sensibles en el JSON crudo`, async () => {
    const { cuerpo } = await pedirComoAdmin(endpoint.ruta);
    const json = JSON.stringify(cuerpo);

    assert.ok(!json.includes(FILA_CON_DATOS_SENSIBLES.fk_cedula_estudiante), 'aparece la cedula');
    assert.ok(!json.includes(FILA_CON_DATOS_SENSIBLES.nombres), 'aparece el nombre');
    assert.ok(!json.includes(FILA_CON_DATOS_SENSIBLES.apellidos), 'aparecen los apellidos');
    assert.ok(!json.includes(FILA_CON_DATOS_SENSIBLES.correo_institucional), 'aparece el correo');
    assert.ok(!json.includes(FILA_CON_DATOS_SENSIBLES.nombre_candidato), 'aparece el candidato');
    assert.ok(!json.includes(FILA_CON_DATOS_SENSIBLES.opcion_votada), 'aparece la opcion votada');
    assert.ok(!/\b\d{10}\b/.test(json), 'hay algo con forma de cedula');
  });

  test(`${endpoint.nombre} no le pide a MySQL los campos sensibles`, async () => {
    consultasEjecutadas.length = 0;
    await pedirComoAdmin(endpoint.ruta);

    assert.ok(consultasEjecutadas.length > 0, 'se esperaba al menos una consulta');
    for (const sql of consultasEjecutadas) {
      for (const campo of CAMPOS_PROHIBIDOS) {
        assert.ok(
          !sql.includes(campo),
          `${endpoint.nombre} selecciona "${campo}", que no debe salir del servidor`
        );
      }
      // Tampoco debe unirse con las tablas de identidad ni de voto.
      for (const tabla of ['estudiante', 'voto ', 'lista_candidata', 'candidato']) {
        assert.ok(
          !sql.includes(` ${tabla}`),
          `${endpoint.nombre} consulta la tabla "${tabla.trim()}", innecesaria para un comprobante anónimo`
        );
      }
    }
  });

  test(`${endpoint.nombre} sigue exigiendo rol admin`, async () => {
    const sinToken = await fetch(`${baseUrl}${endpoint.ruta}`);
    assert.equal(sinToken.status, 401);

    const tokenEstudiante = jwt.sign(
      { sub: '1105946139', email: 'ancarpioto@uide.edu.ec', rol: 'estudiante', fk_id_institucion: 1 },
      process.env.JWT_SECRET!
    );
    const comoEstudiante = await fetch(`${baseUrl}${endpoint.ruta}`, {
      headers: { Authorization: `Bearer ${tokenEstudiante}` },
    });
    assert.equal(comoEstudiante.status, 403);
  });
}

test('crear, actualizar y borrar comprobantes están bloqueados para administradores', async () => {
  const cuerpoEnvio = {
    fk_id_votacion: 1,
    codigo_hash: 'a1b2c3d4e5f6',
    fk_cedula_estudiante: '1105946139',
  };

  const creado = await fetch(`${baseUrl}/api/codigos-voto`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpoEnvio),
  });
  assert.equal(creado.status, 404);

  const actualizado = await fetch(`${baseUrl}/api/codigos-voto/1`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado_codigo: 'usado' }),
  });
  assert.equal(actualizado.status, 404);

  const eliminado = await fetch(`${baseUrl}/api/codigos-voto/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  assert.equal(eliminado.status, 404);
});
