/**
 * Herramientas de escritura.
 *
 * NO se registran salvo con CODEVOTE_MCP_MODE=escritura. Esa diferencia
 * importa: si solo se validara el modo dentro del handler, el modelo seguiría
 * viendo las herramientas en tools/list, las intentaría y gastaría contexto en
 * errores. Al no registrarlas, en modo lectura sencillamente no existen.
 *
 * Lo que hay aquí es administración del proceso (crear, editar, abrir, cerrar,
 * aprobar). Lo que NO hay, y no se puede añadir sin tocar la lista negra de
 * politica.ts: emitir votos, borrar registros y tocar credenciales.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config.js';
import type { ClienteCodeVote } from '../api.js';
import { exito, manejar, ErrorHerramienta } from '../format.js';

/**
 * Anotaciones de escritura. `destructiveHint` es la señal que usan los clientes
 * MCP (Claude Desktop, Claude Code) para pedir confirmación explícita al
 * usuario antes de ejecutar. No es un control de seguridad por sí solo —el
 * control real es la lista blanca— pero sí es la capa que evita el clic
 * automático.
 */
const ESCRITURA = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const ESCRITURA_SUAVE = { ...ESCRITURA, destructiveHint: false, idempotentHint: true } as const;

const idPositivo = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');
const fechaHora = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/, 'Formato esperado: YYYY-MM-DD HH:MM:SS');

export function registrarHerramientasEscritura(
  servidor: McpServer,
  cliente: ClienteCodeVote,
  config: Config,
) {
  servidor.registerTool(
    'codevote_crear_proceso',
    {
      title: 'Crear proceso electoral',
      description:
        'Crea un proceso electoral nuevo. Requiere que la cuenta del MCP tenga rol admin. ' +
        'El proceso nace sin papeletas: después hay que crearlas con codevote_crear_papeleta.',
      inputSchema: {
        nombre_proceso: z.string().min(3).max(120),
        tipo_proceso: z.enum(['consejo_estudiantil', 'representante_carrera', 'referendum']),
        fecha_convocatoria: fecha,
        fecha_inicio_votacion: fechaHora,
        fecha_fin_votacion: fechaHora,
        descripcion: z.string().max(250).optional(),
        estado: z
          .enum(['planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio'])
          .optional()
          .describe('Estado inicial. Los estados finalizado y cancelado no se asignan aquí.'),
      },
      annotations: ESCRITURA,
    },
    async (args) =>
      manejar('codevote_crear_proceso', async () =>
        exito(config, await cliente.pedir('POST', '/procesos-electorales', { cuerpo: args })),
      ),
  );

  servidor.registerTool(
    'codevote_actualizar_proceso',
    {
      title: 'Actualizar un proceso electoral',
      description:
        'Modifica los datos de un proceso existente. Solo se envían los campos indicados. ' +
        'Para terminar un proceso usa codevote_cerrar_proceso, no este.',
      inputSchema: {
        proceso_id: idPositivo,
        nombre_proceso: z.string().min(3).max(120).optional(),
        descripcion: z.string().max(250).optional(),
        fecha_inicio_votacion: fechaHora.optional(),
        fecha_fin_votacion: fechaHora.optional(),
        estado: z
          .enum(['planificado', 'convocado', 'inscripcion', 'campaña', 'votacion', 'escrutinio', 'finalizado'])
          .optional(),
      },
      annotations: ESCRITURA,
    },
    async ({ proceso_id, ...campos }) =>
      manejar('codevote_actualizar_proceso', async () => {
        if (Object.keys(campos).length === 0) {
          throw new ErrorHerramienta('No se indicó ningún campo a modificar.');
        }
        return exito(
          config,
          await cliente.pedir('PATCH', `/procesos-electorales/${proceso_id}`, { cuerpo: campos }),
        );
      }),
  );

  servidor.registerTool(
    'codevote_cerrar_proceso',
    {
      title: 'Cancelar o archivar un proceso',
      description:
        'Cancela un proceso (lo anula conservando todo) o lo archiva (lo saca de las vistas activas una vez ' +
        'finalizado o cancelado). Son las dos alternativas seguras al borrado: la evidencia electoral nunca se ' +
        'elimina. Un proceso activo no se puede archivar y uno finalizado no se puede cancelar.',
      inputSchema: {
        proceso_id: idPositivo,
        accion: z.enum(['cancelar', 'archivar']).describe('Qué hacer con el proceso.'),
      },
      annotations: ESCRITURA,
    },
    async ({ proceso_id, accion }) =>
      manejar('codevote_cerrar_proceso', async () =>
        exito(config, await cliente.pedir('PATCH', `/procesos-electorales/${proceso_id}/${accion}`)),
      ),
  );

  servidor.registerTool(
    'codevote_crear_papeleta',
    {
      title: 'Crear papeleta (votación)',
      description:
        'Crea una papeleta dentro de un proceso. Si se indica carrera_id, solo esa carrera podrá votarla; si se ' +
        'omite, la papeleta es global. No puede haber dos papeletas de la misma carrera en un mismo proceso.',
      inputSchema: {
        proceso_id: idPositivo,
        titulo_papeleta: z.string().min(3).max(120),
        fecha_apertura: fechaHora,
        fecha_cierre: fechaHora,
        carrera_id: idPositivo.optional().describe('Carrera de la papeleta. Omitir para una papeleta global.'),
        estado: z.enum(['pendiente', 'abierta', 'cerrada']).optional(),
      },
      annotations: ESCRITURA,
    },
    async ({ proceso_id, carrera_id, ...resto }) =>
      manejar('codevote_crear_papeleta', async () =>
        exito(
          config,
          await cliente.pedir('POST', '/votaciones', {
            cuerpo: { fk_id_proceso: proceso_id, fk_id_carrera: carrera_id ?? null, ...resto },
          }),
        ),
      ),
  );

  servidor.registerTool(
    'codevote_cambiar_estado_papeleta',
    {
      title: 'Abrir o cerrar una papeleta',
      description:
        'Cambia el estado de una papeleta: pendiente, abierta o cerrada. Abrirla habilita la emisión de votos y ' +
        'cerrarla convierte el escrutinio en oficial. Es una acción con efecto inmediato sobre una elección en ' +
        'curso: confírmala con una persona antes de ejecutarla.',
      inputSchema: {
        votacion_id: idPositivo,
        estado: z.enum(['pendiente', 'abierta', 'cerrada']),
      },
      annotations: ESCRITURA,
    },
    async ({ votacion_id, estado }) =>
      manejar('codevote_cambiar_estado_papeleta', async () =>
        exito(config, await cliente.pedir('PATCH', `/votaciones/${votacion_id}`, { cuerpo: { estado } })),
      ),
  );

  servidor.registerTool(
    'codevote_revisar_lista',
    {
      title: 'Aprobar o rechazar una lista candidata',
      description:
        'Resuelve la revisión de una candidatura. Rechazar exige un motivo, que queda guardado y visible para el ' +
        'candidato. Comprueba antes los requisitos con codevote_validaciones_candidato.',
      inputSchema: {
        lista_id: idPositivo,
        decision: z.enum(['aprobar', 'rechazar']),
        motivo: z
          .string()
          .min(5)
          .max(250)
          .optional()
          .describe('Obligatorio al rechazar. Se guarda como motivo_rechazo.'),
      },
      annotations: ESCRITURA,
    },
    async ({ lista_id, decision, motivo }) =>
      manejar('codevote_revisar_lista', async () => {
        if (decision === 'rechazar' && !motivo) {
          throw new ErrorHerramienta(
            'Rechazar una lista exige un motivo: el candidato tiene derecho a saber por qué.',
          );
        }
        return exito(
          config,
          await cliente.pedir('PATCH', `/listas-candidatas/${lista_id}/${decision}`, {
            cuerpo: decision === 'rechazar' ? { motivo } : undefined,
          }),
        );
      }),
  );

  servidor.registerTool(
    'codevote_crear_hito_cronograma',
    {
      title: 'Agregar un hito al cronograma',
      description:
        'Añade una actividad con fechas al cronograma de un proceso, asignada a un responsable ' +
        '(usa codevote_catalogo con "responsables" para obtener el id).',
      inputSchema: {
        proceso_id: idPositivo,
        responsable_id: idPositivo,
        actividad: z.string().min(3).max(120),
        fecha_inicio: fecha,
        fecha_fin: fecha,
      },
      annotations: ESCRITURA_SUAVE,
    },
    async ({ proceso_id, responsable_id, ...resto }) =>
      manejar('codevote_crear_hito_cronograma', async () =>
        exito(
          config,
          await cliente.pedir('POST', '/cronogramas', {
            cuerpo: { fk_id_proceso: proceso_id, fk_id_responsable: responsable_id, ...resto },
          }),
        ),
      ),
  );

  servidor.registerTool(
    'codevote_registrar_acta',
    {
      title: 'Registrar acta de resultados',
      description:
        'Emite el acta formal de una papeleta. Si no se indican los totales, la herramienta los toma del escrutinio ' +
        'real de la API en lugar de aceptar cifras escritas a mano: un acta con números inventados por un modelo ' +
        'sería un problema serio.',
      inputSchema: {
        votacion_id: idPositivo,
        fecha_emision: fechaHora.optional().describe('Por defecto, el momento actual.'),
      },
      annotations: ESCRITURA,
    },
    async ({ votacion_id, fecha_emision }) =>
      manejar('codevote_registrar_acta', async () => {
        interface Escrutinio {
          resultados: Array<{ id_lista: number | null; opcion: string; total_votos: number }>;
          resumen: { total_votantes: number; ganador?: { nombre_lista?: string } | null };
        }
        const escrutinio = await cliente.pedir<Escrutinio>('GET', `/votos/resultados/${votacion_id}`);

        const filas = escrutinio.resultados ?? [];
        const total = (nombre: string) =>
          filas.find((f) => f.opcion?.toLowerCase() === nombre)?.total_votos ?? 0;
        const blancos = total('blanco');
        const nulos = total('nulo');
        const validos = filas
          .filter((f) => f.id_lista !== null)
          .reduce((suma, f) => suma + (f.total_votos ?? 0), 0);

        const cuerpo = {
          fk_id_votacion: votacion_id,
          total_votantes: escrutinio.resumen?.total_votantes ?? validos + blancos + nulos,
          votos_validos: validos,
          votos_blanco: blancos,
          votos_nulos: nulos,
          lista_ganadora: escrutinio.resumen?.ganador?.nombre_lista ?? 'sin ganador',
          ...(fecha_emision ? { fecha_emision } : {}),
        };

        return exito(config, await cliente.pedir('POST', '/actas-resultados', { cuerpo }), {
          nota: 'Los totales se tomaron del escrutinio de la API, no de valores proporcionados por el modelo.',
        });
      }),
  );
}
