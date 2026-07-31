/**
 * Transporte Streamable HTTP.
 *
 * Alternativa a stdio cuando el servidor MCP debe vivir aparte del cliente:
 * varios usuarios, un contenedor junto a la API, un despliegue remoto. Gana
 * en alcance y pierde en seguridad por defecto — pasa de "no hay puerto" a
 * "hay un puerto que habla con la base de datos electoral". Por eso aquí no
 * arranca sin cuatro cosas:
 *
 *   1. Token Bearer obligatorio (config lo exige antes de arrancar), comparado
 *      en tiempo constante para no filtrar el prefijo correcto.
 *   2. Escucha en 127.0.0.1 por defecto. Exponerlo es una decisión explícita, y
 *      lo correcto es hacerlo detrás del Nginx que ya termina TLS en codevote.lat.
 *   3. Protección contra DNS rebinding: se validan las cabeceras Host y Origin.
 *      Sin esto, una web cualquiera abierta en el navegador del usuario puede
 *      hacer peticiones a http://127.0.0.1:3333 y usar el servidor MCP.
 *   4. Sesiones con identificador aleatorio y tope de tamaño de cuerpo.
 *
 * Nota sobre SSE: el transporte HTTP+SSE de la especificación 2024-11-05 está
 * obsoleto. Streamable HTTP lo reemplaza y admite tanto respuesta JSON directa
 * como streaming, por lo que no se implementa el antiguo.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config.js';
import type { ClienteCodeVote } from '../api.js';
import { crearServidor } from '../server.js';
import { log } from '../logger.js';

const RUTA_MCP = '/mcp';
const MAX_CUERPO = 1_048_576; // 1 MiB

function comparaSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Se compara igual contra sí mismo para no delatar la longitud por tiempo.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function responderJson(res: ServerResponse, estado: number, cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(texto) });
  res.end(texto);
}

function errorJsonRpc(res: ServerResponse, estado: number, codigo: number, mensaje: string) {
  responderJson(res, estado, { jsonrpc: '2.0', error: { code: codigo, message: mensaje }, id: null });
}

/** Lee el cuerpo con tope de bytes: un POST gigante no debe tumbar el proceso. */
function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolver, rechazar) => {
    const declarado = Number(req.headers['content-length'] ?? 0);
    if (declarado > MAX_CUERPO) {
      rechazar(new Error('cuerpo demasiado grande'));
      return;
    }
    let total = 0;
    const trozos: Buffer[] = [];
    req.on('data', (trozo: Buffer) => {
      total += trozo.length;
      if (total > MAX_CUERPO) {
        rechazar(new Error('cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      const texto = Buffer.concat(trozos).toString('utf8');
      if (!texto) {
        resolver(undefined);
        return;
      }
      try {
        resolver(JSON.parse(texto));
      } catch {
        rechazar(new Error('JSON inválido'));
      }
    });
    req.on('error', rechazar);
  });
}

export async function arrancarHttp(cliente: ClienteCodeVote, config: Config): Promise<void> {
  const token = config.httpToken!;
  const sesiones = new Map<string, StreamableHTTPServerTransport>();

  const anfitrionesPermitidos = [
    `${config.httpHost}:${config.httpPort}`,
    `localhost:${config.httpPort}`,
    `127.0.0.1:${config.httpPort}`,
  ];

  // La lista de orígenes NUNCA se deja vacía: el SDK solo valida Origin si hay
  // una lista, así que dejarla vacía equivale a aceptar cualquier página web.
  // Por defecto solo se admiten los orígenes de loopback del propio servidor,
  // que ninguna web de terceros puede presentar. Los clientes MCP nativos no
  // envían Origin y siguen pasando.
  const origenesPermitidos = config.httpOrigenes.length
    ? config.httpOrigenes
    : [
        `http://${config.httpHost}:${config.httpPort}`,
        `http://localhost:${config.httpPort}`,
        `http://127.0.0.1:${config.httpPort}`,
      ];

  const servidorHttp = createServer((req, res) => {
    void atender(req, res).catch((error) => {
      log.error('fallo atendiendo la petición', (error as Error).message);
      if (!res.headersSent) errorJsonRpc(res, 500, -32603, 'Error interno del servidor MCP.');
    });
  });

  async function atender(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/healthz' && req.method === 'GET') {
      responderJson(res, 200, { status: 'ok', servicio: 'codevote-mcp', sesiones: sesiones.size });
      return;
    }

    if (url.pathname !== RUTA_MCP) {
      errorJsonRpc(res, 404, -32601, 'Ruta no encontrada. El endpoint MCP es ' + RUTA_MCP);
      return;
    }

    // --- Autenticación. Antes de tocar nada del protocolo. ---
    const cabecera = req.headers.authorization ?? '';
    const presentado = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
    if (!presentado || !comparaSegura(presentado, token)) {
      log.warn(`intento sin autenticar desde ${req.socket.remoteAddress ?? 'origen desconocido'}`);
      res.setHeader('WWW-Authenticate', 'Bearer');
      errorJsonRpc(res, 401, -32001, 'Token del servidor MCP ausente o inválido.');
      return;
    }

    const idSesion = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      let cuerpo: unknown;
      try {
        cuerpo = await leerCuerpo(req);
      } catch (error) {
        errorJsonRpc(res, 400, -32700, `Cuerpo rechazado: ${(error as Error).message}.`);
        return;
      }

      let transporte = idSesion ? sesiones.get(idSesion) : undefined;

      if (!transporte) {
        if (idSesion) {
          errorJsonRpc(res, 404, -32001, 'Sesión desconocida o expirada. Vuelve a inicializar.');
          return;
        }
        if (!isInitializeRequest(cuerpo)) {
          errorJsonRpc(res, 400, -32000, 'La primera petición de una sesión debe ser initialize.');
          return;
        }

        transporte = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: true,
          allowedHosts: anfitrionesPermitidos,
          allowedOrigins: origenesPermitidos,
          onsessioninitialized: (id) => {
            sesiones.set(id, transporte!);
            log.info(`sesión MCP abierta (${id.slice(0, 8)}…), activas: ${sesiones.size}`);
          },
        });
        transporte.onclose = () => {
          const id = transporte!.sessionId;
          if (id) sesiones.delete(id);
          log.info(`sesión MCP cerrada, activas: ${sesiones.size}`);
        };

        // Una instancia de servidor por sesión: el estado de una conversación
        // no se mezcla con el de otra.
        const servidorMcp = crearServidor(cliente, config);
        await servidorMcp.connect(transporte);
      }

      await transporte.handleRequest(req, res, cuerpo);
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      const transporte = idSesion ? sesiones.get(idSesion) : undefined;
      if (!transporte) {
        errorJsonRpc(res, 400, -32000, 'Falta la cabecera mcp-session-id o la sesión ya no existe.');
        return;
      }
      await transporte.handleRequest(req, res);
      return;
    }

    res.writeHead(405, { Allow: 'GET, POST, DELETE' }).end();
  }

  await new Promise<void>((resolver) => {
    servidorHttp.listen(config.httpPort, config.httpHost, resolver);
  });

  log.info(`escuchando en http://${config.httpHost}:${config.httpPort}${RUTA_MCP}`);
  if (config.httpHost !== '127.0.0.1' && config.httpHost !== 'localhost') {
    log.warn(
      `el servidor está expuesto en ${config.httpHost}. Ponlo detrás de un proxy con TLS y no lo publiques directamente.`,
    );
  }

  const cerrar = async (senal: string) => {
    log.info(`recibida ${senal}, cerrando ${sesiones.size} sesión(es)`);
    for (const transporte of sesiones.values()) await transporte.close().catch(() => undefined);
    servidorHttp.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));
}
