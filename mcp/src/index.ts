#!/usr/bin/env node
/**
 * Punto de entrada del servidor MCP de CodeVote.
 *
 * Orden deliberado: primero se valida la configuración, después se comprueba
 * que la API responde y las credenciales sirven, y solo entonces se abre el
 * transporte. Un servidor MCP que arranca "bien" y falla en la primera
 * herramienta es mucho más difícil de diagnosticar desde el cliente que uno que
 * se niega a arrancar con un mensaje claro en stderr.
 */
import { cargarConfig, configPublica } from './config.js';
import { configurarLog, log } from './logger.js';
import { ClienteCodeVote } from './api.js';
import { crearServidor, NOMBRE, VERSION } from './server.js';
import { arrancarStdio } from './transports/stdio.js';
import { arrancarHttp } from './transports/http.js';

async function principal() {
  const config = cargarConfig();
  configurarLog(config.nivelLog);

  log.info(`${NOMBRE} v${VERSION}`, configPublica(config));

  const cliente = new ClienteCodeVote(config);
  await cliente.verificarArranque();

  if (config.transporte === 'http') {
    await arrancarHttp(cliente, config);
    return;
  }
  await arrancarStdio(crearServidor(cliente, config));
}

principal().catch((error: unknown) => {
  // Sin transporte todavía no hay a quién reportarle por MCP: stderr y salida.
  process.stderr.write(`[codevote-mcp] no se pudo arrancar: ${(error as Error).message}\n`);
  process.exit(1);
});
