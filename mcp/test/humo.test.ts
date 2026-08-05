/**
 * Pruebas de humo del servidor MCP.
 *
 * Levantan el servidor como proceso hijo por stdio —igual que lo haría Claude—
 * y comprueban lo que de verdad importa: qué capacidades se anuncian, que las
 * herramientas devuelven datos reales y que la política bloquea lo que dice que
 * bloquea.
 *
 * Requisitos: la API corriendo en CODEVOTE_API_URL (por defecto localhost:3000)
 * con la base de ejemplo cargada.
 *
 *   node --import tsx --test test/*.test.ts
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { autorizar, ErrorPolitica } from '../src/politica.js';
import { redactar, enmascararCedula, enmascararCorreo } from '../src/redact.js';
import { leerToken, minutosRestantes } from '../src/jwt.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * El acceso real es por código al correo y eso no se automatiza. Para las
 * pruebas se firma un JWT con el mismo secreto que usa la API local: es
 * equivalente a haber canjeado un código, sin depender del buzón de nadie.
 */
function secretoDeLaApi(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    const env = readFileSync(resolve(RAIZ, '..', '.env'), 'utf8');
    const linea = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
    if (linea) return linea.slice('JWT_SECRET='.length).trim();
  } catch {
    /* sin .env: se avisa abajo */
  }
  throw new Error(
    'No se encontró JWT_SECRET. Define la variable o deja el .env de la API en la carpeta superior.',
  );
}

function firmarJwt(carga: Record<string, unknown>, secreto: string): string {
  const base64 = (valor: object) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  const cabecera = base64({ alg: 'HS256', typ: 'JWT' });
  const cuerpo = base64(carga);
  const firma = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

const ahora = Math.floor(Date.now() / 1000);
const TOKEN_ADMIN = firmarJwt(
  { sub: '1710000009', email: 'admin@uide.edu.ec', rol: 'admin', iat: ahora, exp: ahora + 3600 },
  secretoDeLaApi(),
);

const ENTORNO_BASE = {
  ...process.env,
  CODEVOTE_API_URL: process.env.CODEVOTE_API_URL ?? 'http://localhost:3000/api',
  CODEVOTE_TOKEN: TOKEN_ADMIN,
  CODEVOTE_MCP_LOG_LEVEL: 'error',
};

async function conectar(entorno: Record<string, string | undefined>) {
  const cliente = new Client({ name: 'prueba-humo', version: '1.0.0' });
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve(RAIZ, 'src/index.ts')],
    env: entorno as Record<string, string>,
    stderr: 'ignore',
  });
  await cliente.connect(transporte);
  return cliente;
}

function json(resultado: { content: Array<{ type: string; text?: string }> }) {
  const texto = resultado.content.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(texto) as { datos: any; aviso?: string; notas?: string[] };
}

// --------------------------------------------------------------- unitarias --

describe('política de acceso', () => {
  test('emitir un voto está prohibido incluso en modo escritura', () => {
    assert.throws(() => autorizar('POST', '/votos', 'escritura'), ErrorPolitica);
  });

  test('ningún DELETE pasa, en ningún modo', () => {
    assert.throws(() => autorizar('DELETE', '/procesos-electorales/1', 'escritura'), ErrorPolitica);
    assert.throws(() => autorizar('DELETE', '/listas-candidatas/3', 'escritura'), ErrorPolitica);
  });

  test('la escritura se rechaza en modo lectura y se acepta en modo escritura', () => {
    assert.throws(() => autorizar('POST', '/procesos-electorales', 'lectura'), ErrorPolitica);
    assert.doesNotThrow(() => autorizar('POST', '/procesos-electorales', 'escritura'));
  });

  test('las rutas fuera de la lista blanca no existen', () => {
    assert.throws(() => autorizar('GET', '/candidato/mi-lista', 'escritura'), ErrorPolitica);
    assert.throws(() => autorizar('GET', '/codigos-voto/mis-codigos', 'lectura'), ErrorPolitica);
  });

  test('se rechaza el path traversal y las rutas malformadas', () => {
    assert.throws(() => autorizar('GET', '/../../etc/passwd', 'lectura'), ErrorPolitica);
    assert.throws(() => autorizar('GET', 'https://otro-host/facultades', 'lectura'), ErrorPolitica);
    assert.throws(() => autorizar('GET', '/procesos-electorales/%2e%2e/x', 'lectura'), ErrorPolitica);
  });

  test('la lectura permitida pasa', () => {
    assert.doesNotThrow(() => autorizar('GET', '/procesos-electorales', 'lectura'));
    assert.doesNotThrow(() => autorizar('GET', '/votos/resultados/1', 'lectura'));
  });
});

describe('redacción', () => {
  test('los secretos se ocultan siempre, aunque la PII esté desactivada', () => {
    const salida = redactar(
      { token: 'eyJabc.def.ghi', hash_voto: 'a1b2c3', nombre_lista: 'Lista A' },
      { pii: false },
    );
    assert.ok(!JSON.stringify(salida).includes('eyJabc'));
    assert.ok(!JSON.stringify(salida).includes('a1b2c3'));
    assert.equal(salida.nombre_lista, 'Lista A');
  });

  test('cédulas y correos se enmascaran conservando el final útil', () => {
    assert.equal(enmascararCedula('1710000009'), '******0009');
    assert.equal(enmascararCorreo('schininin@uide.edu.ec'), 's********@uide.edu.ec');
  });

  test('la redacción entra en estructuras anidadas', () => {
    const salida = redactar(
      { lista: { integrantes: [{ cedula: '1710000009', nombres: 'Steven' }] } },
      { pii: true },
    );
    assert.equal(salida.lista.integrantes[0]!.cedula, '******0009');
    assert.equal(salida.lista.integrantes[0]!.nombres, 'Steven');
  });
});

describe('lectura del token', () => {
  test('extrae rol, cuenta y caducidad', () => {
    const carga = leerToken(TOKEN_ADMIN);
    assert.equal(carga.rol, 'admin');
    assert.equal(carga.sub, '1710000009');
    const minutos = minutosRestantes(carga);
    assert.ok(minutos !== null && minutos > 50 && minutos <= 60);
  });

  test('un token con saltos de línea o basura se rechaza con un mensaje claro', () => {
    assert.throws(() => leerToken('no-es-un-jwt'), /forma de JWT/);
    assert.throws(() => leerToken('aaa.bbb.ccc'), /no se pudo leer/);
  });

  test('el servidor no arranca sin CODEVOTE_TOKEN', async () => {
    const { cargarConfig } = await import('../src/config.js');
    assert.throws(
      () => cargarConfig({ CODEVOTE_API_URL: 'http://localhost:3000/api' } as NodeJS.ProcessEnv),
      /CODEVOTE_TOKEN/,
    );
  });
});

// ------------------------------------------------------ integración: stdio --

describe('servidor MCP en modo lectura', () => {
  let cliente: Client;

  before(async () => {
    cliente = await conectar({ ...ENTORNO_BASE, CODEVOTE_MCP_MODE: 'lectura' });
  });
  after(async () => {
    await cliente?.close();
  });

  test('anuncia herramientas, recursos y prompts', async () => {
    const { tools } = await cliente.listTools();
    const { resources } = await cliente.listResources();
    const { prompts } = await cliente.listPrompts();

    assert.equal(tools.length, 15, `esperaba 15 herramientas de lectura, hay ${tools.length}`);
    assert.equal(resources.length, 3);
    assert.equal(prompts.length, 3);
  });

  test('ninguna herramienta de escritura está registrada', async () => {
    const { tools } = await cliente.listTools();
    const escritura = tools.filter((t) => t.annotations?.readOnlyHint === false);
    assert.equal(escritura.length, 0, `se registraron herramientas de escritura: ${escritura.map((t) => t.name)}`);
  });

  test('estado_servidor informa la identidad, la caducidad y la política', async () => {
    const salida = json((await cliente.callTool({ name: 'codevote_estado_servidor' })) as any);
    assert.equal(salida.datos.identidad.rol, 'admin');
    assert.equal(typeof salida.datos.identidad.minutos_para_caducar, 'number');
    assert.equal(salida.datos.configuracion.modo, 'lectura');
    assert.equal(salida.datos.politica.escritura_activa, false);
    // El token jamás debe aparecer en una respuesta de herramienta.
    assert.ok(!JSON.stringify(salida).includes('eyJ'));
  });

  test('listar procesos devuelve datos reales', async () => {
    // arguments: {} explícito — el SDK valida el esquema y una herramienta con
    // campos opcionales sigue esperando un objeto, aunque esté vacío.
    const salida = json((await cliente.callTool({ name: 'codevote_listar_procesos', arguments: {} })) as any);
    assert.ok(Array.isArray(salida.datos));
    assert.ok(salida.datos.length > 0);
    assert.ok('nombre_proceso' in salida.datos[0]);
  });

  test('el escrutinio llega agregado y con su carácter provisional u oficial', async () => {
    const salida = json(
      (await cliente.callTool({ name: 'codevote_resultados', arguments: { votacion_id: 1 } })) as any,
    );
    assert.ok(Array.isArray(salida.datos.resultados));
    assert.ok(['provisional', 'oficial'].includes(salida.datos.resumen.estado_resultado));
    // Nada que ligue una persona con su voto.
    const texto = JSON.stringify(salida);
    assert.ok(!texto.includes('cedula'), 'el escrutinio no debe incluir cédulas');
  });

  test('el resumen del padrón no devuelve registros individuales', async () => {
    const salida = json((await cliente.callTool({ name: 'codevote_padron_resumen' })) as any);
    assert.equal(typeof salida.datos.total_estudiantes, 'number');
    assert.ok(!Array.isArray(salida.datos.por_carrera));
    assert.ok(!JSON.stringify(salida).includes('correo_institucional'));
  });

  test('las respuestas marcan que son datos, no instrucciones', async () => {
    const salida = json((await cliente.callTool({ name: 'codevote_catalogo', arguments: { catalogo: 'carreras' } })) as any);
    assert.match(salida.aviso ?? '', /no instrucciones/i);
  });

  test('un argumento inválido lo rechaza el esquema, no la API', async () => {
    const resultado = (await cliente.callTool({
      name: 'codevote_resultados',
      arguments: { votacion_id: -5 },
    })) as { isError?: boolean };
    assert.equal(resultado.isError, true);
  });

  test('el recurso de política declara las rutas prohibidas', async () => {
    const recurso = await cliente.readResource({ uri: 'codevote://politica-de-seguridad' });
    const contenido = JSON.parse((recurso.contents[0] as { text: string }).text);
    assert.ok(contenido.politica.rutas_prohibidas_siempre.some((r: any) => r.operacion.includes('votos')));
  });

  test('los prompts entregan un guion utilizable', async () => {
    const prompt = await cliente.getPrompt({ name: 'auditar-papeleta', arguments: { votacion_id: '1' } });
    const texto = (prompt.messages[0]!.content as { text: string }).text;
    assert.match(texto, /codevote_resultados/);
    assert.match(texto, /provisional/);
  });
});

describe('servidor MCP en modo escritura', () => {
  let cliente: Client;

  before(async () => {
    cliente = await conectar({ ...ENTORNO_BASE, CODEVOTE_MCP_MODE: 'escritura' });
  });
  after(async () => {
    await cliente?.close();
  });

  test('aparecen las herramientas de administración marcadas como no idempotentes', async () => {
    const { tools } = await cliente.listTools();
    const nombres = tools.map((t) => t.name);
    assert.ok(nombres.includes('codevote_crear_proceso'));
    assert.ok(nombres.includes('codevote_cambiar_estado_papeleta'));

    const cambiar = tools.find((t) => t.name === 'codevote_cambiar_estado_papeleta');
    assert.equal(cambiar?.annotations?.readOnlyHint, false);
    assert.equal(cambiar?.annotations?.destructiveHint, true);
  });

  test('sigue sin existir ninguna herramienta para votar o borrar', async () => {
    const { tools } = await cliente.listTools();
    const peligrosas = tools.filter((t) => /votar|emitir_voto|borrar|eliminar/i.test(t.name));
    assert.equal(peligrosas.length, 0);
  });

  test('rechazar una lista sin motivo falla antes de llamar a la API', async () => {
    const resultado = (await cliente.callTool({
      name: 'codevote_revisar_lista',
      arguments: { lista_id: 1, decision: 'rechazar' },
    })) as { isError?: boolean; content: Array<{ text?: string }> };
    assert.equal(resultado.isError, true);
    assert.match(resultado.content[0]?.text ?? '', /motivo/i);
  });
});
