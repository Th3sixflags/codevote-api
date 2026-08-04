/**
 * Cada rol entra por su vía, y ninguna de las dos revela quién es quién.
 *
 *   estudiante  código al correo (OTP)
 *   candidato   código al correo (OTP), igual que un estudiante
 *   admin       correo y contraseña
 *
 * Lo que se comprueba:
 *   - un admin que pide código recibe la MISMA respuesta que una cuenta que no
 *     existe, y no se le emite ningún código;
 *   - una cuenta del padrón enviada al login administrativo recibe el MISMO 401
 *     que una contraseña equivocada;
 *   - el JWT del candidato conserva `rol: candidato`, que es lo que le abre el
 *     portal de su lista sin perder el derecho a votar;
 *   - AUTH_PASSWORD_FALLBACK=true abre la puerta de emergencia al padrón sin
 *     tocar el acceso del admin.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import authRoutes from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const PASSWORD_ADMIN = 'contrasena-del-admin';
let HASH_ADMIN = '';

/** Una cuenta por rol, todas activas. */
const CUENTAS = {
  estudiante: { cedula: '1105946139', nombres: 'Ana',    apellidos: 'Carpio',   correo_institucional: 'ana@uide.edu.ec',   rol: 'estudiante', foto_url: null, password: null as string | null },
  candidato:  { cedula: '1710000017', nombres: 'María',  apellidos: 'González', correo_institucional: 'maria@uide.edu.ec', rol: 'candidato',  foto_url: null, password: null as string | null },
  admin:      { cedula: '1710000009', nombres: 'Steven', apellidos: 'Chininin', correo_institucional: 'admin@uide.edu.ec', rol: 'admin',      foto_url: null, password: null as string | null },
};

interface Estado {
  /** Códigos emitidos. Debe quedar vacío para una cuenta de administración. */
  codigosEmitidos: Array<{ id: number; cedula: string; hash: string; usado: boolean }>;
  sentencias: string[];
}

let estado: Estado;
let avisos: string[] = [];
const warnOriginal = console.warn;
const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;
const fallbackOriginal = process.env.AUTH_PASSWORD_FALLBACK;

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const porIdentificador = (valor: string) =>
  Object.values(CUENTAS).find((c) => c.correo_institucional === valor || c.cedula === valor) ?? null;

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
  estado.sentencias.push(sql);

  // Acceso con código: la consulta filtra por rol, así que un admin no aparece.
  if (sql.includes('FROM estudiante') && sql.includes('correo_institucional = ? OR cedula = ?')) {
    const cuenta = porIdentificador(params[0]);
    if (!cuenta) return [];
    if (sql.includes("rol IN ('estudiante', 'candidato')") && cuenta.rol === 'admin') return [];
    const { password, ...sinPassword } = cuenta;
    return [sinPassword];
  }
  // Login por contraseña: aquí sí se devuelve cualquier rol; el control lo hace
  // el controlador.
  if (sql.includes('FROM estudiante') && sql.includes('correo_institucional = ?')) {
    const cuenta = porIdentificador(params[0]);
    return cuenta ? [cuenta] : [];
  }
  if (sql.includes('FROM codigo_acceso') && sql.includes('usado_at IS NULL')) {
    const vigente = estado.codigosEmitidos.find((c) => c.cedula === params[0] && !c.usado);
    return vigente ? [{
      id_codigo: vigente.id, codigo_hash: vigente.hash, intentos: 0,
      // Recién emitido y sin caducar: lo que interesa aquí es el control de rol,
      // no la caducidad (que cubre auth.otp.test.ts).
      creado_at: new Date(Date.now() - 120_000), expira_at: new Date(Date.now() + 600_000),
    }] : [];
  }
  if (sql.startsWith('UPDATE codigo_acceso SET usado_at = NOW() WHERE id_codigo')) {
    const codigo = estado.codigosEmitidos.find((c) => c.id === Number(params[0]));
    if (!codigo || codigo.usado) return { affectedRows: 0 };
    codigo.usado = true;
    return { affectedRows: 1 };
  }
  if (sql.startsWith('UPDATE codigo_acceso')) return { affectedRows: 0 };
  if (sql.startsWith('INSERT INTO codigo_acceso')) {
    const id = estado.codigosEmitidos.length + 1;
    estado.codigosEmitidos.push({ id, cedula: params[0], hash: params[1], usado: false });
    return { insertId: id };
  }

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

before(async () => {
  HASH_ADMIN = await bcrypt.hash(PASSWORD_ADMIN, 4);
  CUENTAS.admin.password = HASH_ADMIN;

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
  if (fallbackOriginal === undefined) delete process.env.AUTH_PASSWORD_FALLBACK;
  else process.env.AUTH_PASSWORD_FALLBACK = fallbackOriginal;
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
});

beforeEach(() => {
  estado = { codigosEmitidos: [], sentencias: [] };
  avisos = [];
  delete process.env.AUTH_PASSWORD_FALLBACK;
});

async function post(ruta: string, cuerpo: object) {
  const respuesta = await fetch(`${baseUrl}/api/auth${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { http: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

/** Código realmente emitido (el servicio lo registra en el log sin SMTP). */
function ultimoCodigo(): string {
  const encontrado = avisos.at(-1)?.match(/\bes (\d{6})\b/);
  assert.ok(encontrado, 'el servicio no emitió ningún código');
  return encontrado![1];
}

// --- El padrón entra con código ---------------------------------------------

test('el estudiante pide y canjea su código: 200', async () => {
  const pedido = await post('/codigo', { identificador: CUENTAS.estudiante.correo_institucional });
  assert.equal(pedido.http, 200);
  assert.equal(pedido.cuerpo.correo_enmascarado, 'a*a@uide.edu.ec');
  assert.equal(estado.codigosEmitidos.length, 1);

  const canje = await post('/verificar', {
    identificador: CUENTAS.estudiante.correo_institucional, codigo: ultimoCodigo(),
  });
  assert.equal(canje.http, 200);
  assert.equal(canje.cuerpo.usuario.rol, 'estudiante');
});

test('el candidato pide y canjea su código igual que un estudiante: 200', async () => {
  const pedido = await post('/codigo', { identificador: CUENTAS.candidato.correo_institucional });
  assert.equal(pedido.http, 200);
  assert.equal(estado.codigosEmitidos.length, 1);

  const canje = await post('/verificar', {
    identificador: CUENTAS.candidato.correo_institucional, codigo: ultimoCodigo(),
  });
  assert.equal(canje.http, 200);
});

test('el JWT del candidato conserva rol candidato', async () => {
  await post('/codigo', { identificador: CUENTAS.candidato.correo_institucional });
  const { cuerpo } = await post('/verificar', {
    identificador: CUENTAS.candidato.correo_institucional, codigo: ultimoCodigo(),
  });

  // Es lo que le abre el portal de su lista; sin esto tendría que autenticarse
  // otra vez para gestionarla.
  const payload = jwt.verify(cuerpo.token, process.env.JWT_SECRET!) as any;
  assert.equal(payload.rol, 'candidato');
  assert.equal(payload.sub, CUENTAS.candidato.cedula);
  assert.equal(cuerpo.usuario.rol, 'candidato');
});

test('también se puede pedir con la cédula', async () => {
  const { http } = await post('/codigo', { identificador: CUENTAS.candidato.cedula });
  assert.equal(http, 200);
  assert.equal(estado.codigosEmitidos.length, 1);
});

// --- La administración no entra con código ----------------------------------

test('pedir código para un admin no emite nada y responde como si no existiera', async () => {
  const admin = await post('/codigo', { identificador: CUENTAS.admin.correo_institucional });
  const inexistente = await post('/codigo', { identificador: 'nadie@uide.edu.ec' });

  assert.equal(admin.http, 200);
  assert.equal(admin.cuerpo.correo_enmascarado, null);
  // Byte a byte igual que una cuenta inexistente: no hay forma de distinguirlas.
  assert.deepEqual(admin.cuerpo, inexistente.cuerpo);
  assert.deepEqual(estado.codigosEmitidos, [], 'se emitió un código para una cuenta administrativa');
});

test('tampoco por cédula: el admin nunca recibe un código', async () => {
  const { http, cuerpo } = await post('/codigo', { identificador: CUENTAS.admin.cedula });

  assert.equal(http, 200);
  assert.equal(cuerpo.correo_enmascarado, null);
  assert.deepEqual(estado.codigosEmitidos, []);
});

test('verificar un código como admin responde el error genérico', async () => {
  const { http, cuerpo } = await post('/verificar', {
    identificador: CUENTAS.admin.correo_institucional, codigo: '123456',
  });

  assert.equal(http, 401);
  assert.match(cuerpo.error, /no es v[áa]lido o ya caduc[óo]/i);
});

// --- La administración entra con contraseña ---------------------------------

test('el admin inicia sesión con correo y contraseña: 200', async () => {
  const { http, cuerpo } = await post('/login', {
    correo_institucional: CUENTAS.admin.correo_institucional, password: PASSWORD_ADMIN,
  });

  assert.equal(http, 200);
  const payload = jwt.verify(cuerpo.token, process.env.JWT_SECRET!) as any;
  assert.equal(payload.rol, 'admin');
  assert.equal(cuerpo.usuario.rol, 'admin');
  assert.ok(!('password' in cuerpo.usuario), 'la respuesta expone el hash');
});

test('el admin con la contraseña equivocada: 401', async () => {
  const { http, cuerpo } = await post('/login', {
    correo_institucional: CUENTAS.admin.correo_institucional, password: 'la-que-no-es',
  });

  assert.equal(http, 401);
  assert.equal(cuerpo.error, 'Credenciales inválidas.');
});

// --- El padrón no entra por el login administrativo -------------------------

test('estudiante y candidato en /login reciben el mismo 401 genérico', async () => {
  const conPassword = await post('/login', {
    correo_institucional: CUENTAS.admin.correo_institucional, password: 'la-que-no-es',
  });

  for (const cuenta of [CUENTAS.estudiante, CUENTAS.candidato]) {
    const { http, cuerpo } = await post('/login', {
      correo_institucional: cuenta.correo_institucional, password: 'cualquiera',
    });

    assert.equal(http, 401, `${cuenta.rol} entró por el login administrativo`);
    // Idéntico al de una contraseña equivocada: el mensaje no delata el rol.
    assert.deepEqual(cuerpo, conPassword.cuerpo);
  }
});

test('una cuenta del padrón CON contraseña tampoco entra por /login', async () => {
  // Aunque el administrador le hubiera dejado una contraseña de respaldo, sin la
  // variable de emergencia la vía normal sigue siendo el código.
  CUENTAS.estudiante.password = HASH_ADMIN;
  try {
    const { http } = await post('/login', {
      correo_institucional: CUENTAS.estudiante.correo_institucional, password: PASSWORD_ADMIN,
    });
    assert.equal(http, 401);
  } finally {
    CUENTAS.estudiante.password = null;
  }
});

test('AUTH_PASSWORD_FALLBACK=true abre la puerta de emergencia al padrón', async () => {
  process.env.AUTH_PASSWORD_FALLBACK = 'true';
  CUENTAS.estudiante.password = HASH_ADMIN;
  try {
    const { http, cuerpo } = await post('/login', {
      correo_institucional: CUENTAS.estudiante.correo_institucional, password: PASSWORD_ADMIN,
    });

    assert.equal(http, 200);
    assert.equal(cuerpo.usuario.rol, 'estudiante');
  } finally {
    CUENTAS.estudiante.password = null;
  }
});

test('el respaldo no afecta al acceso del admin, que siempre funciona', async () => {
  process.env.AUTH_PASSWORD_FALLBACK = 'true';
  const { http } = await post('/login', {
    correo_institucional: CUENTAS.admin.correo_institucional, password: PASSWORD_ADMIN,
  });
  assert.equal(http, 200);
});

test('el login nunca lee ni devuelve el hash de otras cuentas', async () => {
  await post('/login', {
    correo_institucional: CUENTAS.admin.correo_institucional, password: PASSWORD_ADMIN,
  });

  // Se consulta una sola cuenta, por correo, y no se escribe nada: el hash del
  // administrador no se toca ni se regenera al entrar.
  const escrituras = estado.sentencias.filter((s) => /^(UPDATE|INSERT|DELETE)/i.test(s));
  assert.deepEqual(escrituras, [], 'el login escribió en la base');
});
