import * as repo from '../repositories/voto.repository.js';
import * as notificaciones from './notificacion.service.js';
import { HttpError } from '../utils/httpError.js';
import { procesoVisible } from '../utils/accesoCarrera.js';
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
  if (estado.votacion !== 'abierta') throw new HttpError(409, 'La votación no está abierta.');
  if (estado.proceso === 'finalizado' || estado.proceso === 'cancelado') {
    throw new HttpError(409, 'El proceso electoral no está activo.');
  }

  // Segmentación por carrera: en un proceso de representante de carrera solo
  // pueden votar los estudiantes de esa carrera. Se comprueba en el backend y
  // no se delega al frontend.
  if (!procesoVisible(estado.carrera_proceso, filtro)) {
    throw new HttpError(403, 'Esta votación corresponde a otra carrera.');
  }

  // Un voto 'valido' debe ser por una lista que pertenezca a esta votación.
  if (data.tipo_voto === 'valido' && data.fk_id_lista != null) {
    if (!(await repo.listaPerteneceAVotacion(data.fk_id_lista, data.fk_id_votacion))) {
      throw new HttpError(400, 'La lista seleccionada no pertenece a esta votación.');
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

export async function estadoResultados(votacionId: number) {
  return repo.estadoDeVotacion(votacionId);
}

export async function obtenerResultados(votacionId: number) {
  return repo.countByVotacion(votacionId);
}
