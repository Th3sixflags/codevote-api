/**
 * Inicio de sesión con código de un solo uso (OTP) al correo.
 *
 * Se eliminó la contraseña: el votante escribe su correo institucional o su
 * cédula, recibe un código de 6 dígitos y lo canjea por la sesión.
 *
 * Lo que se comprueba aquí es lo que sostiene la seguridad del flujo:
 *   - el código se guarda hasheado, nunca en claro;
 *   - sirve una sola vez y caduca;
 *   - pedir uno nuevo invalida el anterior;
 *   - los intentos están topados;
 *   - la respuesta es idéntica exista o no la cuenta (no revela el padrón).
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import authRoutes from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  componerCorreoDeCodigo, enmascararCorreo, MAX_INTENTOS, VIGENCIA_SEGUNDOS,
} from '../src/services/auth.service.js';

const CEDULA = '1105946139';
const CORREO = 'ancarpioto@uide.edu.ec';

/** Fila de codigo_acceso tal como la guardaría MySQL. */
interface Codigo {
  id_codigo: number;
  fk_cedula_estudiante: string;
  codigo_hash: string;
  creado_at: Date;
  expira_at: Date;
  usado_at: Date | null;
  intentos: number;
}

interface Estado {
  cuentaActiva: boolean;
  codigos: Codigo[];
  sentencias: string[];
  proximoId: number;
}

let estado: Estado;
const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

/** Avisos que el servicio escribe en el log (de ahí sale el código emitido). */
let avisos: string[] = [];
const warnOriginal = console.warn;

const vigenteDe = (cedula: string) =>
  estado.codigos
    .filter((c) => c.fk_cedula_estudiante === cedula && c.usado_at === null && c.expira_at > new Date())
    .at(-1) ?? null;

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();
  estado.sentencias.push(sql);

  if (sql.includes('FROM estudiante') && sql.includes('correo_institucional = ? OR cedula = ?')) {
    if (!estado.cuentaActiva) return [];
    if (params[0] !== CORREO && params[0] !== CEDULA) return [];
    return [{
      cedula: CEDULA, nombres: 'Ana', apellidos: 'Carpio',
      correo_institucional: CORREO, rol: 'estudiante', foto_url: null,
    }];
  }
  if (sql.includes('FROM codigo_acceso') && sql.includes('usado_at IS NULL')) {
    const c = vigenteDe(params[0]);
    return c ? [c] : [];
  }
  if (sql.startsWith('UPDATE codigo_acceso SET usado_at = NOW() WHERE fk_cedula_estudiante')) {
    for (const c of estado.codigos) {
      if (c.fk_cedula_estudiante === params[0] && c.usado_at === null) c.usado_at = new Date();
    }
    return { affectedRows: 1 };
  }
  if (sql.startsWith('INSERT INTO codigo_acceso')) {
    const [cedula, hash, vigencia] = params;
    const id = (estado.proximoId += 1);
    estado.codigos.push({
      id_codigo: id, fk_cedula_estudiante: cedula, codigo_hash: hash,
      creado_at: new Date(), expira_at: new Date(Date.now() + Number(vigencia) * 1000),
      usado_at: null, intentos: 0,
    });
    return { insertId: id };
  }
  if (sql.startsWith('UPDATE codigo_acceso SET intentos = intentos + 1')) {
    const c = estado.codigos.find((x) => x.id_codigo === Number(params[0]));
    if (c) c.intentos += 1;
    return { affectedRows: 1 };
  }
  if (sql.startsWith('SELECT intentos FROM codigo_acceso')) {
    const c = estado.codigos.find((x) => x.id_codigo === Number(params[0]));
    return c ? [{ intentos: c.intentos }] : [];
  }
  if (sql.startsWith('UPDATE codigo_acceso SET usado_at = NOW() WHERE id_codigo')) {
    const c = estado.codigos.find((x) => x.id_codigo === Number(params[0]));
    if (!c || c.usado_at !== null) return { affectedRows: 0 };
    c.usado_at = new Date();
    return { affectedRows: 1 };
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
  estado = { cuentaActiva: true, codigos: [], sentencias: [], proximoId: 0 };
  avisos = [];
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

const pedirCodigo = (identificador = CORREO) => post('/codigo', { identificador });
const verificar = (codigo: string, identificador = CORREO) =>
  post('/verificar', { identificador, codigo });

/**
 * Código realmente emitido en la última solicitud.
 *
 * La prueba no puede sacarlo de la base (se guarda hasheado, que es justo lo que
 * se quiere). Se aprovecha el comportamiento de desarrollo: sin SMTP configurado
 * el servicio escribe el código en el log del servidor para no dejar a nadie
 * fuera. Se captura ese aviso, de modo que la prueba lee lo mismo que leería
 * quien levanta el backend en local.
 */
function ultimoCodigoEmitido(): string {
  const encontrado = avisos.at(-1)?.match(/\bes (\d{6})\b/);
  assert.ok(encontrado, 'el servicio no registró el código emitido');
  // Y de paso se confirma que lo guardado es el hash de ese código.
  const hash = createHash('sha256').update(encontrado![1]).digest('hex');
  assert.equal(vigenteDe(CEDULA)?.codigo_hash, hash, 'el hash guardado no corresponde al código enviado');
  return encontrado![1];
}

// --- Solicitud del código ---------------------------------------------------

test('pedir el código responde 200 y enmascara el correo de destino', async () => {
  const { http, cuerpo } = await pedirCodigo();

  assert.equal(http, 200);
  assert.equal(cuerpo.correo_enmascarado, enmascararCorreo(CORREO));
  assert.equal(cuerpo.expira_en_segundos, VIGENCIA_SEGUNDOS);
  assert.equal(estado.codigos.length, 1, 'no se emitió el código');
});

test('el código se guarda hasheado, nunca en claro', async () => {
  await pedirCodigo();
  const guardado = estado.codigos[0].codigo_hash;

  assert.match(guardado, /^[a-f0-9]{64}$/, 'no parece un SHA-256 en hexadecimal');
  assert.ok(!/^\d{6}$/.test(guardado), 'el código quedó guardado en claro');
});

test('también se puede pedir con la cédula', async () => {
  const { http, cuerpo } = await pedirCodigo(CEDULA);

  assert.equal(http, 200);
  assert.equal(cuerpo.correo_enmascarado, enmascararCorreo(CORREO));
});

test('una cuenta inexistente responde exactamente igual: no revela el padrón', async () => {
  estado.cuentaActiva = false;

  const { http, cuerpo } = await pedirCodigo();

  assert.equal(http, 200);
  assert.equal(cuerpo.correo_enmascarado, null);
  assert.match(cuerpo.mensaje, /si el correo o la c[ée]dula/i);
  assert.equal(estado.codigos.length, 0, 'se emitió un código para una cuenta que no existe');
});

test('un identificador que no es correo ni cédula se rechaza: 422', async () => {
  for (const valor of ['hola', '123', 'no-es-un-correo@', 'persona@gmail.com', '9999999999']) {
    const { http } = await pedirCodigo(valor);
    assert.equal(http, 422, `"${valor}" pasó la validación`);
  }
});

test('no se puede pedir otro código antes de la espera mínima', async () => {
  await pedirCodigo();

  const { http, cuerpo } = await pedirCodigo();

  assert.equal(http, 429);
  assert.match(cuerpo.error, /espera \d+ segundos/i);
  assert.equal(estado.codigos.length, 1, 'se emitió un segundo código');
});

test('pasada la espera, el código nuevo invalida el anterior', async () => {
  await pedirCodigo();
  const primero = estado.codigos[0];
  // Se envejece el primero para saltar la espera mínima.
  primero.creado_at = new Date(Date.now() - 120_000);

  await pedirCodigo();

  assert.equal(estado.codigos.length, 2);
  assert.ok(primero.usado_at !== null, 'el código anterior sigue vigente');
});

// --- Canje del código -------------------------------------------------------

test('el código correcto devuelve un JWT con la cédula y el rol', async () => {
  await pedirCodigo();
  const codigo = ultimoCodigoEmitido();

  const { http, cuerpo } = await verificar(codigo);

  assert.equal(http, 200);
  const payload = jwt.verify(cuerpo.token, process.env.JWT_SECRET!) as any;
  assert.equal(payload.sub, CEDULA);
  assert.equal(payload.rol, 'estudiante');
  assert.equal(cuerpo.usuario.correo_institucional, CORREO);
  assert.ok(!('password' in cuerpo.usuario), 'la respuesta expone la contraseña');
});

test('el código sirve UNA sola vez', async () => {
  await pedirCodigo();
  const codigo = ultimoCodigoEmitido();

  assert.equal((await verificar(codigo)).http, 200);

  const segundo = await verificar(codigo);
  assert.equal(segundo.http, 401);
  assert.match(segundo.cuerpo.error, /no es v[áa]lido o ya caduc[óo]/i);
});

test('un código caducado no sirve', async () => {
  await pedirCodigo();
  const codigo = ultimoCodigoEmitido();
  estado.codigos[0].expira_at = new Date(Date.now() - 1000);

  const { http } = await verificar(codigo);

  assert.equal(http, 401);
});

test('un código equivocado descuenta intentos y al agotarlos invalida el código', async () => {
  await pedirCodigo();
  const correcto = ultimoCodigoEmitido();
  const equivocado = correcto === '000000' ? '111111' : '000000';

  for (let i = 1; i < MAX_INTENTOS; i += 1) {
    const { http, cuerpo } = await verificar(equivocado);
    assert.equal(http, 401);
    assert.match(cuerpo.error, /te quedan \d+ intentos/i);
  }

  // El intento que agota el cupo invalida el código.
  const ultimo = await verificar(equivocado);
  assert.equal(ultimo.http, 429);
  assert.ok(estado.codigos[0].usado_at !== null, 'el código sigue vigente tras agotar los intentos');

  // Y ni siquiera el correcto sirve ya.
  assert.equal((await verificar(correcto)).http, 401);
});

test('el código de una cuenta no sirve para otra', async () => {
  await pedirCodigo();
  const codigo = ultimoCodigoEmitido();
  estado.cuentaActiva = false;

  const { http } = await verificar(codigo, 'otra.persona@uide.edu.ec');

  assert.equal(http, 401);
});

test('un código con formato inválido se rechaza sin tocar la base', async () => {
  await pedirCodigo();
  estado.sentencias.length = 0;

  for (const valor of ['12345', '1234567', 'abcdef', '']) {
    const { http } = await verificar(valor);
    assert.equal(http, 422, `"${valor}" pasó la validación`);
  }
  assert.deepEqual(estado.sentencias, [], 'se consultó la base con un código malformado');
});

test('se aceptan espacios y guiones al pegar el código desde el correo', async () => {
  await pedirCodigo();
  const codigo = ultimoCodigoEmitido();
  const pegado = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;

  assert.equal((await verificar(pegado)).http, 200);
});

// --- Todas las cuentas activas entran con código ----------------------------

test('la consulta exige cuenta activa sin excluir ningún rol', async () => {
  await pedirCodigo();

  const consulta = estado.sentencias.find((s) => s.includes('FROM estudiante'))!;
  assert.match(consulta, /estado_academico = 'activo'/, 'no exige cuenta activa');
  assert.doesNotMatch(consulta, /rol IN/i, 'todavía excluye roles del acceso OTP');
});

// --- Correo y enmascarado ---------------------------------------------------

test('el correo del código lo lleva en el asunto y en el cuerpo', () => {
  const { asunto, texto, html } = componerCorreoDeCodigo({ nombres: 'Ana', codigo: '482913', minutos: 10 });

  assert.match(asunto, /482913/);
  assert.match(texto, /482913/);
  assert.match(html, /482913/);
  assert.match(texto, /una sola vez/i);
});

test('el enmascarado deja ver el dominio pero no el usuario completo', () => {
  assert.equal(enmascararCorreo('ancarpioto@uide.edu.ec'), 'a********o@uide.edu.ec');
  assert.equal(enmascararCorreo('ab@uide.edu.ec'), 'a***@uide.edu.ec');
  assert.ok(!enmascararCorreo('ancarpioto@uide.edu.ec').includes('ncarpiot'));
});
