/**
 * Transporte stdio.
 *
 * El servidor es un proceso hijo del cliente MCP y se comunica por stdin/stdout
 * con JSON-RPC delimitado por líneas. Es el transporte por defecto de este
 * proyecto porque:
 *
 *   - No abre ningún puerto: no hay superficie de red que atacar.
 *   - La autenticación es el sistema operativo. Solo quien puede lanzar el
 *     proceso puede usarlo, y hereda su entorno (donde viven las credenciales).
 *   - El ciclo de vida lo gestiona el cliente: al cerrar Claude, el proceso
 *     muere y la sesión con la API se pierde con él.
 *
 * A cambio es local y de un solo cliente. Para varios usuarios hace falta el
 * transporte HTTP (ver http.ts).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { log } from '../logger.js';

export async function arrancarStdio(servidor: McpServer): Promise<void> {
  const transporte = new StdioServerTransport();
  await servidor.connect(transporte);
  // Este mensaje va a stderr a propósito: stdout es el canal JSON-RPC.
  log.info('escuchando por stdio');

  const cerrar = async (senal: string) => {
    log.info(`recibida ${senal}, cerrando`);
    await servidor.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));
}
