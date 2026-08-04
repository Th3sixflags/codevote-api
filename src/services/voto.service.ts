import * as repo from '../repositories/voto.repository.js';
import * as notificaciones from './notificacion.service.js';
import { HttpError } from '../utils/httpError.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
import { disponibilidadDeVoto } from '../utils/estadoVotacion.js';
import type { FiltroCarrera } from '../repositories/proceso_electoral.repository.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

export async function yaVoto(votacionId: number, cedula: string) {
  return repo.yaVotoEstudiante(votacionId, cedula);
}

export async function registrarVoto(data: CrearVotoDTO, cedula: string, filtro: FiltroCarrera = undefined) {
  // Integridad electoral: solo se acepta el voto si la votación está ABIERTA y
  // su proceso está activo. Sin esto, una llamada directa a la API permitiría
  // votar en votaciones cerradas o pendientes (el frontend ya lo bloquea, pero
  // el backend debe hacerlo por su cuenta).
  const estado = await repo.estadoDeVotacion(data.fk_id_votacion);
  if (!estado) throw new HttpError(404, 'La votación indicada no existe.');

  // La FECHA se comprueba aquí directamente, no se confía en `votacion.estado`.
  //
  // El cierre automático corre cada minuto: entre que pasa la hora final y la
  // tarea cierra la papeleta hay una ventana en la que la columna todavía dice
  // 'abierta'. Si el servidor estuvo caído, esa ventana puede durar horas.
  // Aceptar un voto ahí dentro sería admitir votos fuera de plazo, así que la
  // misma regla que usan las consultas para responder `puede_votar` decide aquí
  // si el voto entra (ver utils/estadoVotacion.ts).
  const disponibilidad = disponibilidadDeVoto({
    estado:             estado.votacion,
    fecha_apertura:     estado.fecha_apertura,
    fecha_cierre:       estado.fecha_cierre,
    fecha_fin_votacion: estado.fecha_fin_votacion,
    estado_proceso:     estado.proceso,
    archivado:          estado.archivado,
  });
  if (!disponibilidad.puede_votar) {
    throw new HttpError(409, disponibilidad.motivo_no_disponible!);
  }

  // Segmentación por carrera: cada papeleta puede ser global o de una carrera.
  // Solo los estudiantes de esa carrera pueden votarla. Se comprueba en el
  // backend y no se delega al frontend.
  if (!procesoVisible(estado.carrera_votacion, filtro)) {
    throw new HttpError(403, 'Esta votación corresponde a otra carrera.');
  }

  // Competir NO quita el derecho al voto: candidatos e integrantes de una lista
  // votan con normalidad, incluida la papeleta en la que participan. Las demás
  // garantías siguen en pie (una sola vez por papeleta, papeleta abierta, la
  // carrera que corresponde y una lista de esa misma papeleta).

  // Un voto 'valido' debe ser por una lista que pertenezca a esta votación y que
  // esté APROBADA. Una lista en preparación, en revisión, rechazada o retirada
  // no es una opción de la papeleta: tampoco se muestra en Elecciones, así que
  // llegar aquí con ella solo puede venir de una llamada directa a la API.
  if (data.tipo_voto === 'valido' && data.fk_id_lista != null) {
    const estadoLista = await repo.estadoDeListaEnVotacion(data.fk_id_lista, data.fk_id_votacion);
    if (estadoLista === null) {
      throw new HttpError(400, 'La lista seleccionada no pertenece a esta votación.');
    }
    if (estadoLista.toLowerCase() !== 'aprobada') {
      throw new HttpError(409, 'La lista seleccionada no está aprobada, así que no se puede votar por ella.');
    }
  }

  // El hash del comprobante NUNCA se expone al estudiante (mantiene el voto
  // anónimo y evita relacionarlo con la opción elegida): se descarta aquí y
  // solo queda almacenado en codigo_voto para la auditoría administrativa.
  const { comprobante, ...voto } = await repo.createConComprobante(data, cedula);

  // Se notifica al estudiante SOLO después de confirmar la transacción del
  // voto y el comprobante (best-effort: si falla, no rompe el voto).
  await notificaciones.notificar(
    cedula,
    'voto',
    'Voto registrado',
    'Tu voto fue registrado correctamente. Puedes consultar tu participación en Mis recibos.'
  );

  return voto;
}

/** Redondea a dos decimales sin arrastrar el error binario de los flotantes. */
function redondear2(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

interface OpcionResultado {
  id_lista: number | null;
  opcion: string;
  total_votos: number;
}

/**
 * Resultados de una papeleta: conteo por opción más un resumen de participación
 * y ganador.
 *
 * Todo es agregado. No se devuelven cédulas, nombres ni nada que relacione a
 * una persona con su voto: los votos se cuentan de `voto` (que es anónima) y
 * la participación de `codigo_voto` (que prueba que alguien votó, pero no qué).
 */
export async function obtenerResultados(votacionId: number) {
  const estado = await repo.estadoDeVotacion(votacionId);
  if (!estado) throw new HttpError(404, 'La votación indicada no existe.');

  const carreraVotacion = estado.carrera_votacion == null ? null : Number(estado.carrera_votacion);

  const [filas, totalHabilitados, totalVotantes] = await Promise.all([
    repo.countByVotacion(votacionId),
    // Papeleta de carrera -> solo esa carrera; papeleta global -> todo el padrón.
    repo.countHabilitados(carreraVotacion),
    repo.countVotantes(votacionId),
  ]);

  const resultados: OpcionResultado[] = filas.map((fila) => ({
    id_lista:    fila.id_lista == null ? null : Number(fila.id_lista),
    opcion:      String(fila.opcion),
    total_votos: Number(fila.total_votos ?? 0),
  }));

  const faltantes = Math.max(0, totalHabilitados - totalVotantes);
  const participacionPorcentaje = totalHabilitados > 0
    ? redondear2((totalVotantes / totalHabilitados) * 100)
    : 0;

  // Una votación cerrada, o cuyo proceso ya finalizó, da resultados oficiales.
  // Mientras siga abierta son provisionales, aunque ya haya votado todo el
  // padrón: cerrar la votación es una decisión del admin, no un efecto de este
  // endpoint (que solo lee).
  const esOficial = estado.votacion === 'cerrada' || estado.proceso === 'finalizado';

  // Solo las listas pueden ganar. Los blancos y nulos (id_lista nulo) cuentan
  // para la participación, pero nunca son ganadores. Tampoco gana una lista con
  // cero votos: si nadie votó, no hay ganador ni empate.
  const candidatasAGanar = resultados.filter((r) => r.id_lista != null && r.total_votos > 0);
  const maximo = candidatasAGanar.reduce((mayor, r) => Math.max(mayor, r.total_votos), 0);
  const enElMaximo = candidatasAGanar.filter((r) => r.total_votos === maximo);

  const conPorcentaje = (r: OpcionResultado) => ({
    id_lista:     r.id_lista as number,
    nombre_lista: r.opcion,
    total_votos:  r.total_votos,
    // Porcentaje sobre los votos emitidos, incluidos blancos y nulos.
    porcentaje:   totalVotantes > 0 ? redondear2((r.total_votos / totalVotantes) * 100) : 0,
  });

  const hayEmpate = enElMaximo.length > 1;

  return {
    resultados,
    resumen: {
      total_habilitados:        totalHabilitados,
      total_votantes:           totalVotantes,
      faltantes,
      participacion_porcentaje: participacionPorcentaje,
      participacion_completa:   totalHabilitados > 0 && totalVotantes >= totalHabilitados,
      estado_resultado:         esOficial ? 'oficial' : 'provisional',
      ganador:                  hayEmpate || enElMaximo.length === 0 ? null : conPorcentaje(enElMaximo[0]),
      empate:                   hayEmpate,
      listas_empatadas:         hayEmpate ? enElMaximo.map(conPorcentaje) : [],
    },
  };
}
