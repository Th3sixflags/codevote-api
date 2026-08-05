/**
 * Herramientas de consulta. Disponibles en todos los modos.
 *
 * Criterio para elegirlas: la API tiene 71 rutas, pero exponer 71 herramientas
 * sería contraproducente — el modelo elige peor cuanto más largo es el menú, y
 * cada descripción ocupa contexto. Aquí hay 15, orientadas a *preguntas* del
 * dominio electoral ("¿cómo va el escrutinio?") y no a *rutas* HTTP. Varias
 * componen dos o tres llamadas en una sola respuesta, que es donde el MCP
 * aporta algo que un cliente REST genérico no da.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config.js';
import { configPublica } from '../config.js';
import type { ClienteCodeVote } from '../api.js';
import { exito, manejar } from '../format.js';
import { resumenPolitica } from '../politica.js';

/** Todas las herramientas de este módulo son de solo lectura e idempotentes. */
const SOLO_LECTURA = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const idPositivo = z.number().int().positive();

export function registrarHerramientasLectura(servidor: McpServer, cliente: ClienteCodeVote, config: Config) {
  // ------------------------------------------------------------- diagnóstico --

  servidor.registerTool(
    'codevote_estado_servidor',
    {
      title: 'Estado del servidor MCP',
      description:
        'Diagnóstico del propio servidor MCP: con qué identidad y rol está operando contra la API, cuántos ' +
        'minutos le quedan a la sesión, en qué modo (lectura/escritura), qué límites tiene y si la API responde. ' +
        'Úsala primero cuando algo falle, para saber si el problema es de permisos, de política o de sesión caducada.',
      annotations: SOLO_LECTURA,
    },
    async () =>
      manejar('codevote_estado_servidor', async () => {
        let salud: unknown;
        try {
          salud = await cliente.pedir('GET', '/health');
        } catch (error) {
          salud = { alcanzable: false, detalle: (error as Error).message };
        }
        return exito(config, {
          identidad: cliente.identidad,
          configuracion: configPublica(config),
          politica: resumenPolitica(config.modo),
          cupo_peticiones_restante: cliente.cupoDisponible,
          api: salud,
        });
      }),
  );

  // ------------------------------------------------------ procesos y agenda --

  servidor.registerTool(
    'codevote_listar_procesos',
    {
      title: 'Listar procesos electorales',
      description:
        'Procesos electorales de CodeVote. Sin filtro devuelve los no archivados; "actuales" los activos o próximos, ' +
        '"finalizados" el historial y "archivados" los guardados. Es el punto de partida: de aquí sale el id_proceso ' +
        'que piden las demás herramientas.',
      inputSchema: {
        estado: z
          .enum(['actuales', 'finalizados', 'archivados'])
          .optional()
          .describe('Filtro por situación del proceso.'),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ estado }) =>
      manejar('codevote_listar_procesos', async () => {
        const datos = await cliente.pedir('GET', '/procesos-electorales', { query: { estado } });
        return exito(config, datos, { filtro: estado ?? 'no archivados' });
      }),
  );

  servidor.registerTool(
    'codevote_detalle_proceso',
    {
      title: 'Detalle completo de un proceso',
      description:
        'Ficha completa de un proceso electoral: sus datos, sus papeletas (votaciones) y su cronograma, en una sola ' +
        'respuesta. Evita tener que encadenar tres consultas para entender cómo está armado un proceso.',
      inputSchema: { proceso_id: idPositivo.describe('Identificador del proceso electoral.') },
      annotations: SOLO_LECTURA,
    },
    async ({ proceso_id }) =>
      manejar('codevote_detalle_proceso', async () => {
        const [proceso, papeletas, cronograma] = await Promise.all([
          cliente.pedir('GET', `/procesos-electorales/${proceso_id}`),
          cliente.pedir('GET', `/votaciones/proceso/${proceso_id}`),
          cliente.pedir('GET', `/cronogramas/proceso/${proceso_id}`).catch(() => []),
        ]);
        return exito(config, { proceso, papeletas, cronograma });
      }),
  );

  servidor.registerTool(
    'codevote_cronograma',
    {
      title: 'Cronograma de un proceso',
      description:
        'Hitos y fechas de un proceso electoral: inscripción, campaña, votación, escrutinio. Útil para responder ' +
        '"¿qué toca ahora?" o "¿ya cerró la inscripción?".',
      inputSchema: { proceso_id: idPositivo.describe('Identificador del proceso electoral.') },
      annotations: SOLO_LECTURA,
    },
    async ({ proceso_id }) =>
      manejar('codevote_cronograma', async () =>
        exito(config, await cliente.pedir('GET', `/cronogramas/proceso/${proceso_id}`)),
      ),
  );

  // ------------------------------------------------------------- papeletas --

  servidor.registerTool(
    'codevote_listar_papeletas',
    {
      title: 'Listar papeletas (votaciones)',
      description:
        'Papeletas del sistema. Cada papeleta es una votación concreta dentro de un proceso y puede ser global ' +
        '(vota todo el padrón) o de una carrera (solo esa carrera). Devuelve su estado: pendiente, abierta o cerrada.',
      inputSchema: {
        proceso_id: idPositivo.optional().describe('Limita a las papeletas de ese proceso.'),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ proceso_id }) =>
      manejar('codevote_listar_papeletas', async () => {
        const ruta = proceso_id ? `/votaciones/proceso/${proceso_id}` : '/votaciones';
        return exito(config, await cliente.pedir('GET', ruta));
      }),
  );

  servidor.registerTool(
    'codevote_detalle_papeleta',
    {
      title: 'Detalle de una papeleta',
      description:
        'Una papeleta con las listas que compiten en ella. Sirve para ver la oferta electoral de una votación antes ' +
        'de mirar resultados.',
      inputSchema: { votacion_id: idPositivo.describe('Identificador de la papeleta.') },
      annotations: SOLO_LECTURA,
    },
    async ({ votacion_id }) =>
      manejar('codevote_detalle_papeleta', async () => {
        const [papeleta, listas] = await Promise.all([
          cliente.pedir('GET', `/votaciones/${votacion_id}`),
          cliente.pedir('GET', `/listas-candidatas/votacion/${votacion_id}`),
        ]);
        return exito(config, { papeleta, listas });
      }),
  );

  // ----------------------------------------------------------- candidaturas --

  servidor.registerTool(
    'codevote_listar_listas',
    {
      title: 'Listar listas candidatas',
      description:
        'Listas candidatas, opcionalmente filtradas por proceso o papeleta y por estado de revisión ' +
        '(pendiente, en_revision, aprobada, rechazada, retirada). Útil para saber qué candidaturas faltan por revisar.',
      inputSchema: {
        proceso_id: idPositivo.optional().describe('Limita a las listas de ese proceso.'),
        votacion_id: idPositivo.optional().describe('Limita a las listas de esa papeleta.'),
        estado_revision: z
          .enum(['pendiente', 'en_revision', 'aprobada', 'rechazada', 'retirada'])
          .optional()
          .describe('Filtra por estado de revisión.'),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ proceso_id, votacion_id, estado_revision }) =>
      manejar('codevote_listar_listas', async () => {
        const ruta = votacion_id
          ? `/listas-candidatas/votacion/${votacion_id}`
          : proceso_id
            ? `/listas-candidatas/proceso/${proceso_id}`
            : '/listas-candidatas';
        let datos = (await cliente.pedir<Array<Record<string, unknown>>>('GET', ruta)) ?? [];
        if (estado_revision) datos = datos.filter((l) => l.estado_revision === estado_revision);
        return exito(config, datos, { total_tras_filtro: datos.length });
      }),
  );

  servidor.registerTool(
    'codevote_detalle_lista',
    {
      title: 'Detalle de una lista candidata',
      description:
        'Ficha de una lista candidata con sus integrantes (candidatos y cargos) y sus planes de trabajo. ' +
        'Es la vista que usarías para revisar una candidatura antes de aprobarla o rechazarla.',
      inputSchema: { lista_id: idPositivo.describe('Identificador de la lista candidata.') },
      annotations: SOLO_LECTURA,
    },
    async ({ lista_id }) =>
      manejar('codevote_detalle_lista', async () => {
        const [lista, candidatos, planes] = await Promise.all([
          cliente.pedir('GET', `/listas-candidatas/${lista_id}`),
          cliente.pedir('GET', `/candidatos/lista/${lista_id}`).catch(() => []),
          cliente.pedir('GET', `/planes-trabajo/lista/${lista_id}`).catch(() => []),
        ]);
        return exito(config, { lista, candidatos, planes_trabajo: planes });
      }),
  );

  servidor.registerTool(
    'codevote_validaciones_candidato',
    {
      title: 'Validaciones de requisitos de un candidato',
      description:
        'Estado de cumplimiento de los requisitos de un candidato (promedio, matrícula, etc.), con la observación ' +
        'de quien validó. Responde "¿este candidato es elegible y por qué?".',
      inputSchema: { candidato_id: idPositivo.describe('Identificador del candidato.') },
      annotations: SOLO_LECTURA,
    },
    async ({ candidato_id }) =>
      manejar('codevote_validaciones_candidato', async () =>
        exito(config, await cliente.pedir('GET', `/validaciones-requisito/candidato/${candidato_id}`)),
      ),
  );

  // ------------------------------------------------------------ escrutinio --

  servidor.registerTool(
    'codevote_resultados',
    {
      title: 'Escrutinio de una papeleta',
      description:
        'Resultados agregados de una votación: votos por opción (incluidos blancos y nulos), padrón habilitado, ' +
        'participación, ganador y si hay empate. Marca si el resultado es provisional (votación abierta) u oficial. ' +
        'Todo es agregado por diseño de la API: no existe forma de saber qué votó una persona.',
      inputSchema: { votacion_id: idPositivo.describe('Identificador de la papeleta.') },
      annotations: SOLO_LECTURA,
    },
    async ({ votacion_id }) =>
      manejar('codevote_resultados', async () =>
        exito(config, await cliente.pedir('GET', `/votos/resultados/${votacion_id}`)),
      ),
  );

  servidor.registerTool(
    'codevote_actas',
    {
      title: 'Actas de resultados',
      description:
        'Actas de escrutinio emitidas. El acta es el documento formal del resultado, a diferencia del conteo en vivo ' +
        'que devuelve codevote_resultados.',
      inputSchema: {
        votacion_id: idPositivo.optional().describe('Limita al acta de esa papeleta.'),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ votacion_id }) =>
      manejar('codevote_actas', async () => {
        const ruta = votacion_id ? `/actas-resultados/votacion/${votacion_id}` : '/actas-resultados';
        return exito(config, await cliente.pedir('GET', ruta));
      }),
  );

  servidor.registerTool(
    'codevote_veeduria',
    {
      title: 'Veeduría electoral',
      description:
        'Veedores registrados y sus veedurías (observaciones sobre una papeleta). Es la trazabilidad de control ' +
        'externo del proceso.',
      inputSchema: {
        votacion_id: idPositivo.optional().describe('Limita a las veedurías de esa papeleta.'),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ votacion_id }) =>
      manejar('codevote_veeduria', async () => {
        const veedurias = await cliente.pedir(
          'GET',
          votacion_id ? `/veedurias/votacion/${votacion_id}` : '/veedurias',
        );
        const veedores = await cliente.pedir('GET', '/veedores').catch(() => []);
        return exito(config, { veedurias, veedores });
      }),
  );

  // -------------------------------------------------------------- catálogos --

  servidor.registerTool(
    'codevote_catalogo',
    {
      title: 'Catálogos institucionales',
      description:
        'Catálogos de apoyo: facultades, carreras, directores, responsables o requisitos. Se agrupan en una sola ' +
        'herramienta porque son consultas planas y equivalentes; separarlas solo inflaría el menú de herramientas.',
      inputSchema: {
        catalogo: z
          .enum(['facultades', 'carreras', 'directores', 'responsables', 'requisitos'])
          .describe('Catálogo a consultar.'),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ catalogo }) =>
      manejar('codevote_catalogo', async () => exito(config, await cliente.pedir('GET', `/${catalogo}`))),
  );

  servidor.registerTool(
    'codevote_padron_resumen',
    {
      title: 'Resumen del padrón (solo agregados)',
      description:
        'Composición del padrón estudiantil en números: total y desglose por carrera, estado académico y rol. ' +
        'NO devuelve filas de estudiantes ni datos personales — está diseñada así a propósito: para contextualizar ' +
        'la participación no hace falta saber quién es quién.',
      annotations: SOLO_LECTURA,
    },
    async () =>
      manejar('codevote_padron_resumen', async () => {
        const estudiantes =
          (await cliente.pedir<Array<Record<string, unknown>>>('GET', '/estudiantes')) ?? [];

        const contar = (campo: string) => {
          const cuenta: Record<string, number> = {};
          for (const e of estudiantes) {
            const clave = String(e[campo] ?? 'sin_dato');
            cuenta[clave] = (cuenta[clave] ?? 0) + 1;
          }
          return cuenta;
        };

        // Se mapea el id de carrera a su nombre para que el resumen se entienda solo.
        const carreras =
          (await cliente
            .pedir<Array<{ id_carrera: number; nombre_carrera: string }>>('GET', '/carreras')
            .catch(() => [])) ?? [];
        const nombrePorId = new Map(carreras.map((c) => [String(c.id_carrera), c.nombre_carrera]));

        const porCarrera: Record<string, number> = {};
        for (const [id, total] of Object.entries(contar('fk_id_carrera'))) {
          porCarrera[nombrePorId.get(id) ?? `carrera ${id}`] = total;
        }

        return exito(
          config,
          {
            total_estudiantes: estudiantes.length,
            por_carrera: porCarrera,
            por_estado_academico: contar('estado_academico'),
            por_rol: contar('rol'),
          },
          { nota_privacidad: 'Agregados únicamente. Esta herramienta nunca devuelve registros individuales.' },
        );
      }),
  );

  servidor.registerTool(
    'codevote_mis_notificaciones',
    {
      title: 'Notificaciones de la cuenta del MCP',
      description:
        'Notificaciones de la cuenta con la que el servidor MCP está autenticado (no de otros usuarios: la API solo ' +
        'entrega las del token). Sirve para ver avisos del sistema sobre los procesos.',
      annotations: SOLO_LECTURA,
    },
    async () =>
      manejar('codevote_mis_notificaciones', async () =>
        exito(config, await cliente.pedir('GET', '/notificaciones')),
      ),
  );
}
