/**
 * Contrato de GET /api/votos/resultados/:votacionId.
 *
 * Cubre el conteo, la participación y la decisión de ganador. La base de datos
 * se sustituye por un doble que responde según la consulta que recibe, así que
 * las pruebas ejercitan el SQL real que arma el repositorio y toda la lógica
 * del servicio, sin necesitar MySQL.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

/** Estado que devuelve el doble de base de datos en cada escenario. */
interface Escenario {
  votacion: string;
  proceso: string;
  carrera_votacion: number | null;
  /** Filas del conteo por opción, tal como saldrían de MySQL. */
  conteo: Array<{ id_lista: number | null; opcion: string; total_votos: number }>;
  habilitados: number;
  votantes: number;
  /** Carrera del estudiante que consulta, para el filtro por carrera. */
  carreraEstudiante?: number | null;
}

let escenario: Escenario;
const consultas: string[] = [];

const queryOriginal = pool.query.bind(pool);

const app = express();
app.use(express.json());
app.use('/api/votos', votoRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const tokenAdmin = jwt.sign(
  { sub: '1710000009', email: 'schininin@uide.edu.ec', rol: 'admin', fk_id_institucion: 1 },
  process.env.JWT_SECRET!
);
const tokenEstudiante = jwt.sign(
  { sub: '1105946139', email: 'ancarpioto@uide.edu.ec', rol: 'estudiante', fk_id_institucion: 1 },
  process.env.JWT_SECRET!
);
const tokenCandidato = jwt.sign(
  { sub: '1710000017', email: 'presidente@uide.edu.ec', rol: 'candidato', fk_id_institucion: 1 },
  process.env.JWT_SECRET!
);

before(async () => {
  // Doble de MySQL: reconoce cada consulta por su forma y responde lo que diga
  // el escenario. Si aparece una consulta inesperada, la prueba lo denuncia.
  (pool as any).query = async (sql: string, params: any[] = []) => {
    consultas.push(sql);

    if (sql.includes('FROM votacion v') && sql.includes('p.estado AS proceso')) {
      return [[{
        votacion: escenario.votacion,
        proceso: escenario.proceso,
        carrera_votacion: escenario.carrera_votacion,
        fk_id_institucion: 1,
      }], []];
    }
    if (sql.includes('FROM lista_candidata l') && sql.includes('total_votos')) {
      return [escenario.conteo, []];
    }
    if (sql.includes('FROM estudiante e') && sql.includes('COUNT(*) AS total')) {
      // Se comprueba de paso que el filtro de carrera llega como parámetro.
      assert.deepEqual(params, [1, escenario.carrera_votacion, escenario.carrera_votacion]);
      return [[{ total: escenario.habilitados }], []];
    }
    if (sql.includes('FROM codigo_voto')) {
      return [[{ total: escenario.votantes }], []];
    }
    if (sql.includes('fk_id_carrera FROM estudiante') || sql.includes('e.fk_id_carrera')) {
      return [[{ fk_id_carrera: escenario.carreraEstudiante ?? null }], []];
    }
    throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 120)}`);
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

beforeEach(() => {
  consultas.length = 0;
  escenario = {
    votacion: 'abierta',
    proceso: 'votacion',
    carrera_votacion: null,
    conteo: [
      { id_lista: 1, opcion: 'Halo',  total_votos: 12 },
      { id_lista: 2, opcion: 'Nexus', total_votos: 5 },
      { id_lista: null, opcion: 'blanco', total_votos: 1 },
      { id_lista: null, opcion: 'nulo',   total_votos: 1 },
    ],
    habilitados: 19,
    votantes: 19,
    carreraEstudiante: null,
  };
});

async function pedirResultados(token: string | null = tokenAdmin, votacionId = 1) {
  const respuesta = await fetch(`${baseUrl}/api/votos/resultados/${votacionId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

test('conteo global: el admin ve el contrato completo', async () => {
  const { estado, cuerpo } = await pedirResultados();

  assert.equal(estado, 200);
  assert.deepEqual(cuerpo.resultados[0], { id_lista: 1, opcion: 'Halo', total_votos: 12 });
  assert.deepEqual(cuerpo.resumen, {
    total_habilitados: 19,
    total_votantes: 19,
    faltantes: 0,
    participacion_porcentaje: 100,
    participacion_completa: true,
    estado_resultado: 'provisional',
    ganador: { id_lista: 1, nombre_lista: 'Halo', total_votos: 12, porcentaje: 63.16 },
    empate: false,
    listas_empatadas: [],
  });
});

test('papeleta global: el padron se pide sin filtro de carrera', async () => {
  escenario.carrera_votacion = null;
  const { cuerpo } = await pedirResultados();
  // El doble ya verificó que el parámetro de carrera llegó nulo.
  assert.equal(cuerpo.resumen.total_habilitados, 19);
});

test('papeleta de carrera: el padron se filtra por esa carrera', async () => {
  escenario.carrera_votacion = 8;
  escenario.habilitados = 11;
  escenario.votantes = 7;

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.total_habilitados, 11);
  const consultaPadron = consultas.find((s) => s.includes('FROM estudiante e'));
  assert.ok(consultaPadron, 'no se consultó el padrón');
  assert.ok(
    consultaPadron!.includes('e.fk_id_carrera = ?'),
    'el padrón no filtra por carrera'
  );
});

test('el padrón incluye a los candidatos y excluye a la administración', async () => {
  // Competir no quita el derecho al voto, así que los candidatos entran en el
  // padrón: si no, la participación nunca podría llegar al 100%.
  await pedirResultados();
  const consultaPadron = consultas.find((s) => s.includes('FROM estudiante e'))!;

  assert.ok(
    consultaPadron.includes("e.rol IN ('estudiante', 'candidato')"),
    'el padrón debe contar a estudiantes y candidatos, y solo a ellos'
  );
  assert.ok(
    !consultaPadron.includes('FROM candidato c'),
    'ya no debe excluir a los integrantes de las listas de la papeleta'
  );
  assert.ok(
    !consultaPadron.includes('FROM asignacion_candidatura a'),
    'ya no debe excluir a quien tiene una asignación de candidatura'
  );
  assert.ok(consultaPadron.includes("e.estado_academico = 'activo'"), 'cuenta a estudiantes no activos');
});

test('participacion incompleta: calcula faltantes y porcentaje', async () => {
  escenario.habilitados = 19;
  escenario.votantes = 12;

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.faltantes, 7);
  assert.equal(cuerpo.resumen.participacion_porcentaje, 63.16);
  assert.equal(cuerpo.resumen.participacion_completa, false);
});

test('participacion completa no cierra la votacion sola', async () => {
  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.participacion_completa, true);
  // Sigue abierta y, por tanto, provisional: cerrarla es decisión del admin.
  assert.equal(cuerpo.resumen.estado_resultado, 'provisional');
  const huboEscritura = consultas.some((s) => /\b(UPDATE|INSERT|DELETE)\b/i.test(s));
  assert.equal(huboEscritura, false, 'el endpoint de resultados escribió en la base');
});

test('ganador provisional mientras la votacion sigue abierta', async () => {
  escenario.votacion = 'abierta';
  escenario.proceso = 'votacion';

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.estado_resultado, 'provisional');
  assert.equal(cuerpo.resumen.ganador.id_lista, 1);
});

test('ganador oficial cuando la votacion esta cerrada', async () => {
  escenario.votacion = 'cerrada';

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.estado_resultado, 'oficial');
  assert.equal(cuerpo.resumen.ganador.nombre_lista, 'Halo');
});

test('ganador oficial cuando el proceso esta finalizado', async () => {
  escenario.votacion = 'abierta';
  escenario.proceso = 'finalizado';

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.estado_resultado, 'oficial');
});

test('empate: sin ganador y con las listas empatadas', async () => {
  escenario.conteo = [
    { id_lista: 1, opcion: 'Halo',  total_votos: 8 },
    { id_lista: 2, opcion: 'Nexus', total_votos: 8 },
    { id_lista: 3, opcion: 'Orion', total_votos: 2 },
    { id_lista: null, opcion: 'blanco', total_votos: 1 },
  ];
  escenario.votantes = 19;

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.empate, true);
  assert.equal(cuerpo.resumen.ganador, null);
  assert.deepEqual(cuerpo.resumen.listas_empatadas, [
    { id_lista: 1, nombre_lista: 'Halo',  total_votos: 8, porcentaje: 42.11 },
    { id_lista: 2, nombre_lista: 'Nexus', total_votos: 8, porcentaje: 42.11 },
  ]);
});

test('blancos y nulos cuentan como participacion pero nunca ganan', async () => {
  escenario.conteo = [
    { id_lista: null, opcion: 'blanco', total_votos: 10 },
    { id_lista: null, opcion: 'nulo',   total_votos: 6 },
    { id_lista: 1, opcion: 'Halo',  total_votos: 3 },
  ];
  escenario.habilitados = 19;
  escenario.votantes = 19;

  const { cuerpo } = await pedirResultados();

  // Los 19 votantes incluyen a quienes votaron blanco o nulo.
  assert.equal(cuerpo.resumen.total_votantes, 19);
  assert.equal(cuerpo.resumen.participacion_completa, true);
  // Gana Halo con 3 votos, aunque el blanco tenga 10.
  assert.equal(cuerpo.resumen.ganador.nombre_lista, 'Halo');
  assert.equal(cuerpo.resumen.empate, false);
});

test('sin votos no hay ganador ni empate', async () => {
  escenario.conteo = [
    { id_lista: 1, opcion: 'Halo',  total_votos: 0 },
    { id_lista: 2, opcion: 'Nexus', total_votos: 0 },
  ];
  escenario.habilitados = 19;
  escenario.votantes = 0;

  const { cuerpo } = await pedirResultados();

  assert.equal(cuerpo.resumen.ganador, null);
  assert.equal(cuerpo.resumen.empate, false);
  assert.deepEqual(cuerpo.resumen.listas_empatadas, []);
  assert.equal(cuerpo.resumen.participacion_porcentaje, 0);
  assert.equal(cuerpo.resumen.faltantes, 19);
});

test('las listas sin votos aparecen en el conteo con cero', async () => {
  const { cuerpo } = await pedirResultados();
  const consultaConteo = consultas.find((s) => s.includes('FROM lista_candidata l'))!;
  assert.ok(consultaConteo.includes('LEFT JOIN voto'), 'las listas sin votos quedarían fuera del conteo');
});

// --- Quién puede consultar el escrutinio -----------------------------------
// El resultado es EXCLUSIVAMENTE administrativo, en cualquier momento y estado.

test('admin recibe 200 con la votacion abierta', async () => {
  escenario.votacion = 'abierta';
  const { estado } = await pedirResultados(tokenAdmin);
  assert.equal(estado, 200);
});

test('usuario sin token recibe 401', async () => {
  const { estado } = await pedirResultados(null);
  assert.equal(estado, 401);
});

test('estudiante recibe 403 con la votacion abierta', async () => {
  escenario.votacion = 'abierta';
  escenario.proceso = 'votacion';

  const { estado, cuerpo } = await pedirResultados(tokenEstudiante);

  assert.equal(estado, 403);
  assert.match(cuerpo.error, /rol admin/i);
});

test('candidato recibe 403: competir no da acceso al escrutinio', async () => {
  const { estado } = await pedirResultados(tokenCandidato);
  assert.equal(estado, 403);
});

test('cerrar la votacion no habilita los resultados al estudiante', async () => {
  escenario.votacion = 'cerrada';

  const { estado } = await pedirResultados(tokenEstudiante);

  assert.equal(estado, 403);
});

test('finalizar el proceso tampoco los habilita al estudiante ni al candidato', async () => {
  escenario.votacion = 'cerrada';
  escenario.proceso = 'finalizado';

  assert.equal((await pedirResultados(tokenEstudiante)).estado, 403);
  assert.equal((await pedirResultados(tokenCandidato)).estado, 403);
});

test('un 403 no consulta el conteo: no se filtra nada por la respuesta', async () => {
  consultas.length = 0;
  await pedirResultados(tokenEstudiante);
  assert.deepEqual(consultas, [], 'se consultó la base pese a no tener permiso');
});

test('la respuesta no contiene identidad de votantes', async () => {
  const { cuerpo } = await pedirResultados();
  const json = JSON.stringify(cuerpo);

  for (const campo of ['cedula', 'fk_cedula_estudiante', 'nombres', 'apellidos', 'correo']) {
    assert.ok(!json.includes(campo), `la respuesta incluye "${campo}"`);
  }
  assert.ok(!/\b\d{10}\b/.test(json), 'hay algo con forma de cédula en la respuesta');
});
