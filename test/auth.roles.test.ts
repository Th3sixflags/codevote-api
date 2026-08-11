/**
 * Los tres roles usan exactamente el mismo acceso OTP.
 *
 * La prueba fija que estudiante, candidato y admin reciben y canjean su código,
 * que el JWT conserva el rol y que la ruta histórica de contraseña ya no existe.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import authRoutes from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const CUENTAS = {
  estudiante: { cedula: '1105946139', nombres: 'Ana', apellidos: 'Carpio', correo_institucional: 'ana@uide.edu.ec', rol: 'estudiante', foto_url: null },
  candidato:  { cedula: '1710000017', nombres: 'María', apellidos: 'González', correo_institucional: 'maria@uide.edu.ec', rol: 'candidato', foto_url: null },
  admin:      { cedula: '1710000009', nombres: 'Steven', apellidos: 'Chininin', correo_institucional: 'admin@uide.edu.ec', rol: 'admin', foto_url: null },
};

interface CodigoEmitido {
  id: number;
  cedula: string;
  hash: string;
  usado: boolean;
}

let codigos: CodigoEmitido[] = [];
let sentencias: string[] = [];
let avisos: string[] = [];
const warnOriginal = console.warn;
const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const porIdentificador = (valor: string) =>
  Object.values(CUENTAS).find((cuenta) => cuenta.correo_institucional === valor || cuenta.cedula === valor) ?? null;

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
  sentencias.push(sql);

  if (sql.includes('FROM estudiante') && sql.includes('correo_institucional = ? OR cedula = ?')) {
    const cuenta = porIdentificador(params[0]);
    return cuenta ? [cuenta] : [];
  }
  if (sql.includes('FROM codigo_acceso') && sql.includes('usado_at IS NULL')) {
    const vigente = codigos.find((codigo) => codigo.cedula === params[0] && !codigo.usado);
    return vigente ? [{
      id_codigo: vigente.id,
      codigo_hash: vigente.hash,
      intentos: 0,
      creado_at: new Date(Date.now() - 120_000),
      expira_at: new Date(Date.now() + 600_000),
    }] : [];
  }
  if (sql.startsWith('UPDATE codigo_acceso SET usado_at = NOW() WHERE id_codigo')) {
    const codigo = codigos.find((item) => item.id === Number(params[0]));
    if (!codigo || codigo.usado) return { affectedRows: 0 };
    codigo.usado = true;
    return { affectedRows: 1 };
  }
  if (sql.startsWith('UPDATE codigo_acceso')) return { affectedRows: 0 };
  if (sql.startsWith('INSERT INTO codigo_acceso')) {
    const id = codigos.length + 1;
    codigos.push({ id, cedula: params[0], hash: params[1], usado: false });
    return { insertId: id };
  }

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(async () => {
  console.warn = (...args: unknown[]) => { avisos.push(args.join(' ')); };
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
  (pool as any).getConnection = async () => ({
    query: async (sql: string, params: any[] = []) => [ejecutar(sql, params), []],
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  console.warn = warnOriginal;
  (pool as any).query = queryOriginal;
  (pool as any).getConnection = getConnectionOriginal;
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

beforeEach(() => {
  codigos = [];
  sentencias = [];
  avisos = [];
});

async function post(ruta: string, cuerpo: object) {
  const respuesta = await fetch(`${baseUrl}/api/auth${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let respuestaCuerpo: any = null;
  try { respuestaCuerpo = texto ? JSON.parse(texto) : null; } catch { respuestaCuerpo = texto; }
  return { http: respuesta.status, cuerpo: respuestaCuerpo };
}

function ultimoCodigo(): string {
  const encontrado = avisos.at(-1)?.match(/\bes (\d{6})\b/);
  assert.ok(encontrado, 'el servicio no emitió ningún código');
  return encontrado![1];
}

for (const rol of ['estudiante', 'candidato', 'admin'] as const) {
  test(`${rol} solicita y canjea el código OTP`, async () => {
    const cuenta = CUENTAS[rol];
    const solicitud = await post('/codigo', { identificador: cuenta.correo_institucional });

    assert.equal(solicitud.http, 200);
    assert.notEqual(solicitud.cuerpo.correo_enmascarado, null);
    assert.equal(codigos.length, 1);

    const acceso = await post('/verificar', {
      identificador: cuenta.correo_institucional,
      codigo: ultimoCodigo(),
    });
    assert.equal(acceso.http, 200);
    assert.equal(acceso.cuerpo.usuario.rol, rol);

    const payload = jwt.verify(acceso.cuerpo.token, process.env.JWT_SECRET!) as any;
    assert.equal(payload.rol, rol);
    assert.equal(payload.sub, cuenta.cedula);
  });
}

test('el admin también puede solicitar el código usando su cédula', async () => {
  const solicitud = await post('/codigo', { identificador: CUENTAS.admin.cedula });
  assert.equal(solicitud.http, 200);
  assert.equal(codigos[0]?.cedula, CUENTAS.admin.cedula);
});

test('el login histórico por contraseña ya no está disponible', async () => {
  const respuesta = await post('/login', {
    correo_institucional: CUENTAS.admin.correo_institucional,
    password: 'cualquier-clave',
  });
  assert.equal(respuesta.http, 404);
  assert.equal(sentencias.length, 0, 'la ruta retirada consultó la base');
});

test('un correo ajeno a UIDE se acepta ahora por la flexibilización', async () => {
  const { http } = await post('/codigo', { identificador: 'alguien@gmail.com' });
  assert.equal(http, 200);
});

test('la consulta OTP no contiene filtros que excluyan al admin', async () => {
  await post('/codigo', { identificador: CUENTAS.admin.correo_institucional });
  const consulta = sentencias.find((sql) => sql.includes('FROM estudiante'))!;
  assert.doesNotMatch(consulta, /rol IN/i);
  assert.match(consulta, /estado_academico = 'activo'/i);
});
