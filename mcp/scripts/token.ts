#!/usr/bin/env node
/**
 * Genera el CODEVOTE_TOKEN que necesita el servidor MCP.
 *
 * La API accede con un código de un solo uso enviado al correo institucional,
 * así que el servidor MCP no puede autenticarse solo: alguien tiene que leer el
 * correo. Este script hace esa parte manual en un comando en vez de dos curl.
 *
 *   npm run token                       -- pregunta el correo y el código
 *   npm run token -- --config           -- además lo escribe en Claude Desktop
 *   npm run token -- -i 1710000009      -- entra por cédula
 *   npm run token -- --api http://localhost:3000/api
 *
 * El token se imprime y se copia al portapapeles SIN salto de línea, que es
 * justo el detalle que rompe el JSON de configuración si se copia a mano.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { leerToken, minutosRestantes } from '../src/jwt.js';
import { extraerTokenSesion } from '../src/session-token.js';

const API_POR_DEFECTO = process.env.CODEVOTE_API_URL ?? 'https://codevote.lat/api';

const RUTA_CLAUDE =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : join(process.env.APPDATA ?? join(homedir(), '.config'), 'Claude', 'claude_desktop_config.json');

// Colores solo si la salida es un terminal (no si se redirige a un archivo).
const tty = stdout.isTTY;
const c = {
  verde: (t: string) => (tty ? `\x1b[32m${t}\x1b[0m` : t),
  rojo: (t: string) => (tty ? `\x1b[31m${t}\x1b[0m` : t),
  ambar: (t: string) => (tty ? `\x1b[33m${t}\x1b[0m` : t),
  gris: (t: string) => (tty ? `\x1b[90m${t}\x1b[0m` : t),
  fuerte: (t: string) => (tty ? `\x1b[1m${t}\x1b[0m` : t),
};

interface Opciones {
  api: string;
  identificador?: string;
  escribirConfig: boolean;
}

function leerArgumentos(argv: string[]): Opciones {
  const opciones: Opciones = { api: API_POR_DEFECTO, escribirConfig: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') opciones.escribirConfig = true;
    else if (arg === '--api') opciones.api = argv[++i] ?? opciones.api;
    else if (arg === '-i' || arg === '--identificador') opciones.identificador = argv[++i];
    else if (arg === '-h' || arg === '--help') {
      console.log(`
Uso: npm run token -- [opciones]

  -i, --identificador <valor>  Correo institucional o cédula
      --api <url>              URL de la API (por defecto ${API_POR_DEFECTO})
      --config                 Escribe el token en la configuración de Claude Desktop
  -h, --help                   Esta ayuda
`);
      process.exit(0);
    }
  }
  return opciones;
}

async function pedirJson(url: string, cuerpo: unknown): Promise<{ datos: any; cabeceras: Headers }> {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await respuesta.text();
  let datos: any = {};
  try {
    datos = JSON.parse(texto);
  } catch {
    /* respuesta no-JSON: se maneja abajo con el estado */
  }
  if (!respuesta.ok) {
    const detalle = datos?.error ?? datos?.mensaje ?? `HTTP ${respuesta.status}`;
    throw new Error(detalle);
  }
  return { datos, cabeceras: respuesta.headers };
}

/** Copia al portapapeles sin salto de línea final. Silencioso si no se puede. */
function copiar(texto: string): boolean {
  const comando =
    process.platform === 'darwin'
      ? ['pbcopy']
      : process.platform === 'win32'
        ? ['clip']
        : ['xclip', '-selection', 'clipboard'];
  try {
    const r = spawnSync(comando[0]!, comando.slice(1), { input: texto });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Escribe el token en la configuración de Claude Desktop.
 *
 * Sustituye solo el valor de CODEVOTE_TOKEN con una expresión regular acotada,
 * en lugar de reescribir el JSON completo: así el resto del archivo —que tiene
 * las preferencias del usuario— queda byte a byte como estaba.
 */
function escribirEnClaude(token: string): { ok: boolean; motivo?: string } {
  let contenido: string;
  try {
    contenido = readFileSync(RUTA_CLAUDE, 'utf8');
  } catch {
    return { ok: false, motivo: `no existe ${RUTA_CLAUDE}` };
  }

  try {
    const config = JSON.parse(contenido);
    if (!config?.mcpServers?.codevote?.env) {
      return { ok: false, motivo: 'la configuración no tiene todavía la entrada mcpServers.codevote' };
    }
  } catch {
    return { ok: false, motivo: 'el archivo no es JSON válido; arréglalo antes' };
  }

  const patron = /("CODEVOTE_TOKEN"\s*:\s*")[^"]*(")/;
  if (!patron.test(contenido)) {
    return { ok: false, motivo: 'no se encontró la clave CODEVOTE_TOKEN' };
  }
  const actualizado = contenido.replace(patron, `$1${token}$2`);

  try {
    JSON.parse(actualizado);
  } catch {
    return { ok: false, motivo: 'la sustitución habría roto el JSON; no se escribió nada' };
  }

  writeFileSync(RUTA_CLAUDE, actualizado, 'utf8');
  return { ok: true };
}

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log(c.fuerte('\nToken de acceso para el servidor MCP de CodeVote'));
    console.log(c.gris(`API: ${opciones.api}\n`));

    const identificador =
      opciones.identificador ?? (await rl.question('Correo institucional o cédula: ')).trim();
    if (!identificador) throw new Error('Hace falta un correo o una cédula.');

    process.stdout.write('Pidiendo el código… ');
    const { datos: solicitud } = await pedirJson(`${opciones.api}/auth/codigo`, { identificador });
    console.log(c.verde('listo'));

    // La API responde igual exista o no la cuenta, para no filtrar quién está
    // registrado. El correo enmascarado en null es la única pista de que no hay
    // cuenta, y conviene decírselo a quien está en la terminal.
    if (!solicitud.correo_enmascarado) {
      console.log(
        c.ambar(
          `\n⚠  La API no reconoció "${identificador}". No te va a llegar ningún código.\n` +
            '   Revisa el correo o la cédula y vuelve a intentarlo.\n',
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(`\nCódigo enviado a ${c.fuerte(solicitud.correo_enmascarado)}`);
    console.log(c.gris(`Caduca en ${Math.round((solicitud.expira_en_segundos ?? 600) / 60)} minutos.\n`));

    const codigo = (await rl.question('Código de 6 dígitos: ')).trim();
    if (!/^\d{6}$/.test(codigo)) throw new Error('El código son 6 dígitos.');

    process.stdout.write('Canjeando… ');
    const respuestaSesion = await pedirJson(`${opciones.api}/auth/verificar`, { identificador, codigo });
    const token = extraerTokenSesion(respuestaSesion.datos, respuestaSesion.cabeceras);
    if (!token) throw new Error('La API no devolvió una sesión de acceso.');
    console.log(c.verde('listo\n'));

    const carga = leerToken(token);
    const minutos = minutosRestantes(carga);

    console.log(`Rol:     ${c.fuerte(carga.rol)}`);
    console.log(`Cuenta:  ${carga.email}`);
    if (minutos !== null) {
      const texto = `${minutos} minutos (hasta las ${new Date(carga.exp! * 1000).toLocaleTimeString('es-EC')})`;
      console.log(`Caduca:  ${minutos < 90 ? c.ambar(texto) : texto}`);
    }
    if (carga.rol !== 'admin') {
      console.log(
        c.ambar(`\n⚠  Esta cuenta es "${carga.rol}": el MCP solo verá lo que ve ese rol en la aplicación.`),
      );
    }

    console.log(`\n${c.gris('── token ──')}\n${token}\n${c.gris('───────────')}`);

    if (copiar(token)) console.log(c.verde('✔ Copiado al portapapeles (sin salto de línea).'));

    if (opciones.escribirConfig) {
      const resultado = escribirEnClaude(token);
      if (resultado.ok) {
        console.log(c.verde(`✔ Escrito en ${RUTA_CLAUDE}`));
        console.log(c.fuerte('\n→ Reinicia Claude Desktop con Cmd+Q y vuelve a abrirlo.\n'));
      } else {
        console.log(c.ambar(`\n⚠  No se pudo actualizar Claude Desktop: ${resultado.motivo}.`));
        console.log(c.gris('   Pega el token a mano en CODEVOTE_TOKEN.\n'));
      }
    } else {
      console.log(c.gris('\nPega el token en CODEVOTE_TOKEN, o repite con --config para escribirlo solo.\n'));
    }
  } catch (error) {
    console.error(c.rojo(`\n✖ ${(error as Error).message}\n`));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

void principal();
