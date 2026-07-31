/**
 * Prompts MCP.
 *
 * Son plantillas que el *usuario* invoca (en Claude Desktop aparecen en el menú
 * de "+"), no algo que el modelo dispare solo. Su valor aquí: encapsulan el
 * orden correcto de consultas para tareas que en este dominio se hacen mal si
 * se improvisan — por ejemplo, leer resultados sin comprobar antes si la
 * papeleta está abierta (y por tanto si el dato es provisional).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registrarPrompts(servidor: McpServer) {
  servidor.registerPrompt(
    'auditar-papeleta',
    {
      title: 'Auditar una papeleta',
      description:
        'Revisión completa de una votación: estado, oferta electoral, escrutinio, participación y veeduría, ' +
        'con las salvedades correspondientes si el resultado aún es provisional.',
      argsSchema: {
        votacion_id: z.string().describe('Identificador numérico de la papeleta a auditar.'),
      },
    },
    ({ votacion_id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Audita la papeleta ${votacion_id} de CodeVote siguiendo este orden:

1. codevote_detalle_papeleta — estado de la papeleta, si es global o de carrera, y qué listas compiten.
2. codevote_resultados — escrutinio. Fíjate en estado_resultado: si dice "provisional" la votación sigue
   abierta y NINGUNA conclusión sobre el ganador es definitiva. Dilo explícitamente si es el caso.
3. codevote_veeduria — observaciones registradas sobre esta papeleta.

Entrega:
- Situación de la papeleta en una línea.
- Tabla de resultados por opción, con porcentaje sobre votos emitidos.
- Participación: votantes sobre habilitados, y cuántos faltan.
- Ganador o empate, con la salvedad de provisional/oficial.
- Cualquier señal rara: participación del 0 %, empate exacto, listas sin votos, veedurías con observaciones.

No inventes cifras: si un dato no vino de una herramienta, dilo en lugar de estimarlo.`,
          },
        },
      ],
    }),
  );

  servidor.registerPrompt(
    'informe-de-proceso',
    {
      title: 'Informe de un proceso electoral',
      description:
        'Informe ejecutivo de un proceso completo: agenda, papeletas, estado de las candidaturas y resultados ' +
        'de las votaciones ya cerradas.',
      argsSchema: {
        proceso_id: z.string().describe('Identificador numérico del proceso electoral.'),
      },
    },
    ({ proceso_id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Prepara un informe del proceso electoral ${proceso_id} de CodeVote.

Consulta, en este orden:
1. codevote_detalle_proceso — datos, papeletas y cronograma en una sola llamada.
2. codevote_listar_listas (proceso_id) — candidaturas y su estado de revisión.
3. codevote_resultados por cada papeleta cerrada. No lo hagas con las pendientes.

Estructura del informe:
- **Situación**: en qué fase está el proceso y qué hito toca según el cronograma.
- **Papeletas**: cuántas, cuáles son globales y cuáles por carrera, y su estado.
- **Candidaturas**: total y desglose por estado de revisión; señala las pendientes de revisar.
- **Resultados**: solo de papeletas cerradas, indicando que son oficiales.
- **Riesgos y pendientes**: fechas vencidas sin cerrar, papeletas sin listas aprobadas, listas rechazadas
  sin motivo, cualquier inconsistencia entre el cronograma y el estado real.

Sé concreto y breve. Prefiere números a adjetivos.`,
          },
        },
      ],
    }),
  );

  servidor.registerPrompt(
    'revisar-candidaturas',
    {
      title: 'Revisar candidaturas pendientes',
      description:
        'Repasa las listas pendientes de revisión de un proceso y verifica los requisitos de sus integrantes, ' +
        'proponiendo una decisión razonada para cada una.',
      argsSchema: {
        proceso_id: z.string().describe('Identificador numérico del proceso electoral.'),
      },
    },
    ({ proceso_id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Revisa las candidaturas pendientes del proceso ${proceso_id} de CodeVote.

1. codevote_listar_listas con proceso_id=${proceso_id} y estado_revision="pendiente".
2. Para cada lista: codevote_detalle_lista para ver integrantes y planes de trabajo.
3. Para cada integrante: codevote_validaciones_candidato.

Para cada lista entrega: nombre, papeleta en la que compite, integrantes con su cargo, requisitos cumplidos
e incumplidos, y una recomendación (aprobar / rechazar con motivo / pedir subsanación), justificada solo
con lo que devolvieron las herramientas.

Importante: propón, no ejecutes. Aprobar o rechazar una candidatura es una decisión de la administración,
y en modo lectura la herramienta ni siquiera existe. Presenta las recomendaciones y espera confirmación.`,
          },
        },
      ],
    }),
  );
}
