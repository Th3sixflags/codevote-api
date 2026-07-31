/**
 * Recursos MCP.
 *
 * Diferencia con las herramientas: un recurso es contexto que el cliente decide
 * cargar (o el usuario adjunta), no una acción que el modelo ejecuta. Aquí se
 * usan para lo que no cambia en cada consulta: el modelo de datos electoral, el
 * contrato de la API y la política de seguridad activa.
 *
 * Poner la guía del dominio como recurso —y no repetirla en cada descripción de
 * herramienta— es lo que permite que las 15 herramientas tengan descripciones
 * cortas sin que el modelo se pierda con el vocabulario del proyecto.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import { configPublica } from './config.js';
import type { ClienteCodeVote } from './api.js';
import { resumenPolitica, RUTAS_LECTURA, RUTAS_ESCRITURA, RUTAS_PROHIBIDAS } from './politica.js';
import { log } from './logger.js';

const GUIA = `# Modelo electoral de CodeVote

Cadena central del dominio, de arriba abajo:

    Proceso electoral
      └── Papeleta (votación)      ← global o de una carrera
            └── Lista candidata    ← compite en una papeleta
                  └── Candidato    ← estudiante con un cargo en la lista
            └── Voto               ← anónimo, uno por estudiante y papeleta
            └── Acta de resultados ← documento formal del escrutinio

## Conceptos que se confunden con frecuencia

- **Proceso** ≠ **papeleta**. El proceso es la elección completa ("Elecciones
  2026"); la papeleta es cada votación concreta dentro de él. La *carrera* se
  define en la papeleta, no en el proceso: una papeleta sin carrera es global y
  la vota todo el padrón; una con carrera solo la votan los estudiantes de esa
  carrera.
- **Resultados** ≠ **acta**. \`codevote_resultados\` es el conteo en vivo y viene
  marcado como *provisional* mientras la papeleta siga abierta u *oficial*
  cuando se cierra. El acta es el documento emitido al final.
- **Cancelar/archivar** ≠ **borrar**. Un proceso con actividad electoral no se
  borra nunca: se cancela (se anula conservando todo) o se archiva (sale de las
  vistas activas). La API lo bloquea con claves foráneas, a propósito.

## Estados

- Proceso: planificado → convocado → inscripcion → campaña → votacion →
  escrutinio → finalizado. Fuera de la secuencia: cancelado, archivado.
- Papeleta: pendiente → abierta → cerrada.
- Lista candidata: pendiente → en_revision → aprobada | rechazada | retirada.
- Voto: valido | blanco | nulo.

## Roles

- **estudiante**: consulta los procesos que le tocan y vota una vez por papeleta.
- **candidato**: además gestiona su lista en el portal del candidato.
- **admin**: administra todo el proceso y ve el escrutinio en vivo.

El rol con el que opera el MCP determina qué ve: consúltalo con
\`codevote_estado_servidor\` antes de concluir que "no hay datos".

## El secreto del voto

La API guarda el voto y el comprobante por separado y nunca devuelve el hash que
los relaciona. No existe ningún endpoint —y por tanto ninguna herramienta— que
diga qué votó una persona. Si te piden esa información, la respuesta correcta es
que el sistema está diseñado para que sea imposible, no que falta un permiso.
`;

export function registrarRecursos(servidor: McpServer, cliente: ClienteCodeVote, config: Config) {
  servidor.registerResource(
    'guia-modelo-electoral',
    'codevote://guia/modelo-electoral',
    {
      title: 'Guía del modelo electoral',
      description:
        'Vocabulario y reglas del dominio CodeVote: procesos, papeletas, listas, estados, roles y secreto del voto.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIA }],
    }),
  );

  servidor.registerResource(
    'politica-de-seguridad',
    'codevote://politica-de-seguridad',
    {
      title: 'Política de seguridad activa',
      description:
        'Modo, límites y listas blanca/negra con las que este servidor MCP está operando ahora mismo. ' +
        'Consúltala para saber qué está permitido antes de intentarlo.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              configuracion: configPublica(config),
              politica: resumenPolitica(config.modo),
              detalle: {
                prohibidas: RUTAS_PROHIBIDAS.map((r) => `${r.metodo} ${r.patron.source}`),
                lectura: RUTAS_LECTURA.map((r) => `${r.metodo} ${r.patron.source}`),
                escritura: RUTAS_ESCRITURA.map((r) => `${r.metodo} ${r.patron.source}`),
              },
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  servidor.registerResource(
    'contrato-api',
    'codevote://api/contrato',
    {
      title: 'Contrato de la API (resumen del OpenAPI)',
      description:
        'Rutas reales de la API CodeVote con su resumen, y cuáles de ellas expone este MCP. Muestra la diferencia ' +
        'entre la superficie completa de la API y la superficie reducida del servidor MCP.',
      mimeType: 'application/json',
    },
    async (uri) => {
      let resumen: unknown;
      try {
        // El OpenAPI completo pasa del tope normal de respuesta: se sube solo
        // para esta lectura y se reduce a lo esencial antes de devolverlo.
        interface Spec {
          info?: { title?: string; version?: string };
          paths?: Record<string, Record<string, { summary?: string; tags?: string[] }>>;
        }
        const spec = await cliente.pedir<Spec>('GET', '/openapi.json', { topeBytes: 2_000_000 });
        const rutas: Array<{ operacion: string; resumen?: string }> = [];
        for (const [ruta, metodos] of Object.entries(spec.paths ?? {})) {
          for (const [metodo, op] of Object.entries(metodos)) {
            if (!['get', 'post', 'patch', 'put', 'delete'].includes(metodo)) continue;
            rutas.push({ operacion: `${metodo.toUpperCase()} ${ruta}`, resumen: op?.summary });
          }
        }
        resumen = {
          api: spec.info,
          operaciones_en_la_api: rutas.length,
          operaciones_expuestas_por_el_mcp: RUTAS_LECTURA.length + RUTAS_ESCRITURA.length,
          operaciones: rutas,
        };
      } catch (error) {
        log.warn('no se pudo leer el OpenAPI de la API', (error as Error).message);
        resumen = {
          error:
            'No se pudo obtener el OpenAPI desde la API. Comprueba que esté accesible en /api/openapi.json ' +
            '(se desactiva con DOCS_ENABLED=false).',
        };
      }
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(resumen, null, 2) }],
      };
    },
  );
}
