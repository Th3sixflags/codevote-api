import * as repo from '../repositories/voto.repository.js';
import * as notificaciones from './notificacion.service.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

export async function yaVoto(votacionId: number, cedula: string) {
  return repo.yaVotoEstudiante(votacionId, cedula);
}

export async function registrarVoto(data: CrearVotoDTO, cedula: string) {
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
