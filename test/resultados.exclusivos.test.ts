/**
 * Los resultados electorales son EXCLUSIVAMENTE administrativos.
 *
 * Cubre las dos mitades de la regla:
 *
 *   1. Los endpoints que sí publican resultados —el escrutinio en vivo y las
 *      actas archivadas— responden 401 sin token y 403 a estudiantes y
 *      candidatos, sin importar el estado de la papeleta.
 *   2. Ningún OTRO contrato (procesos, papeletas, listas, candidatos, planes,
 *      veedurías...) devuelve conteos, porcentajes, ganador, empate ni
 *      participación, que sería la forma de saltarse lo anterior.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import actaRoutes from '../src/routes/acta_resultados.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const token = (rol: string) =>
  jwt.sign({ sub: '1710000017', email: `${rol}@uide.edu.ec`, rol }, process.env.JWT_SECRET!);

const app = express();
app.use(express.json());
app.use('/api/votos', votoRoutes);
app.use('/api/actas-resultados', actaRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';
let consultas: string[] = [];
const queryOriginal = (pool as any).query;

/** Rutas que publican resultados: escrutinio en vivo y actas archivadas. */
const RUTAS_DE_RESULTADOS = [
  '/api/votos/resultados/1',
  '/api/actas-resultados',
  '/api/actas-resultados/1',
  '/api/actas-resultados/votacion/1',
];

before(async () => {
  // Si alguna petición sin permiso llegara a la base, la prueba lo denuncia.
  (pool as any).query = async (sql: string) => {
    consultas.push(sql);
    return [[], []];
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

async function pedir(ruta: string, rol: string | null) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    headers: rol ? { Authorization: `Bearer ${token(rol)}` } : {},
  });
  return respuesta.status;
}

test('sin token, todos los resultados responden 401', async () => {
  for (const ruta of RUTAS_DE_RESULTADOS) {
    assert.equal(await pedir(ruta, null), 401, `${ruta} no exige token`);
  }
});

test('el estudiante recibe 403 en todos los resultados', async () => {
  for (const ruta of RUTAS_DE_RESULTADOS) {
    assert.equal(await pedir(ruta, 'estudiante'), 403, `${ruta} se le abre al estudiante`);
  }
});

test('el candidato recibe 403 en todos los resultados', async () => {
  for (const ruta of RUTAS_DE_RESULTADOS) {
    assert.equal(await pedir(ruta, 'candidato'), 403, `${ruta} se le abre al candidato`);
  }
});

test('un rechazo nunca llega a consultar la base', async () => {
  consultas = [];
  for (const ruta of RUTAS_DE_RESULTADOS) {
    await pedir(ruta, 'estudiante');
    await pedir(ruta, null);
  }
  assert.deepEqual(consultas, [], 'una petición sin permiso consultó los resultados');
});

test('un administrador no puede crear, editar ni borrar actas manualmente', async () => {
  const autorizacion = `Bearer ${jwt.sign(
    { sub: '1710000009', rol: 'admin', fk_id_institucion: 1 },
    process.env.JWT_SECRET!
  )}`;
  for (const [method, ruta] of [
    ['POST', '/api/actas-resultados'],
    ['PATCH', '/api/actas-resultados/1'],
    ['DELETE', '/api/actas-resultados/1'],
  ]) {
    const respuesta = await fetch(`${baseUrl}${ruta}`, {
      method,
      headers: { Authorization: autorizacion, 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : '{}',
    });
    assert.equal(respuesta.status, 404, `${method} ${ruta} sigue expuesto`);
  }
});

// --- 2. Ningún otro contrato filtra resultados -----------------------------

const DIR_SRC = path.resolve(import.meta.dirname, '../src');

/**
 * Campos de escrutinio. `tiene_votos` (bandera EXISTS usada para saber si un
 * registro se puede eliminar) no cuenta: no es un conteo ni revela a nadie.
 */
const CAMPOS_DE_RESULTADO = [
  'total_votos', 'total_votantes', 'votos_validos', 'votos_blanco', 'votos_nulos',
  'lista_ganadora', 'ganador', 'empate', 'porcentaje', 'participacion',
];

/** Módulos a los que sí les corresponde manejar resultados. */
const MODULOS_DE_RESULTADO = /(^|\/)(voto|acta_resultados|cierre_votacion)\./;

function fuentesDe(subcarpeta: string) {
  const dir = path.join(DIR_SRC, subcarpeta);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !MODULOS_DE_RESULTADO.test(f))
    .map((f) => ({ archivo: `${subcarpeta}/${f}`, texto: readFileSync(path.join(dir, f), 'utf8') }));
}

test('ningún repositorio ajeno al escrutinio consulta campos de resultado', () => {
  for (const { archivo, texto } of fuentesDe('repositories')) {
    for (const campo of CAMPOS_DE_RESULTADO) {
      assert.ok(
        !texto.includes(campo),
        `${archivo} menciona "${campo}": los resultados solo salen por /votos/resultados y /actas-resultados`
      );
    }
  }
});

test('ningún controlador ajeno al escrutinio devuelve campos de resultado', () => {
  for (const { archivo, texto } of fuentesDe('controllers')) {
    for (const campo of CAMPOS_DE_RESULTADO) {
      assert.ok(!texto.includes(campo), `${archivo} menciona "${campo}"`);
    }
  }
});

test('las lecturas administrativas exigen requireAdmin y la lectura estudiantil usa su guard', () => {
  for (const archivo of ['voto.routes.ts', 'acta_resultados.routes.ts']) {
    const texto = readFileSync(path.join(DIR_SRC, 'routes', archivo), 'utf8');
    const gets = texto.split('\n').filter((l) => l.includes("router.get("));
    assert.ok(gets.length > 0, `${archivo} no declara ninguna lectura`);
    for (const linea of gets.filter((l) => !l.includes('/estudiante'))) {
      assert.ok(linea.includes('requireAdmin'), `${archivo}: "${linea.trim()}" no exige requireAdmin`);
    }
  }
  const voto = readFileSync(path.join(DIR_SRC, 'routes', 'voto.routes.ts'), 'utf8');
  assert.match(voto, /resultados\/:votacionId\/estudiante.*requireEstudiante/);
});
