import * as repo from '../repositories/voto.repository.js';
import * as notificaciones from './notificacion.service.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

export async function yaVoto(votacionId: number, cedula: string) {
  return repo.yaVotoEstudiante(votacionId, cedula);
}

export async function registrarVoto(data: CrearVotoDTO, cedula: string) {
  const resultado = await repo.createConComprobante(data, cedula);

  // Notifica al estudiante que su voto y comprobante fueron registrados.
  await notificaciones.notificar(
    cedula,
    'voto',
    'Voto registrado',
    `Tu voto en "${resultado.titulo_papeleta}" fue registrado correctamente. `
      + `Comprobante: ${String(resultado.comprobante).slice(0, 12)}…`
  );

  return resultado;
}

export async function estadoResultados(votacionId: number) {
  return repo.estadoDeVotacion(votacionId);
}

export async function obtenerResultados(votacionId: number) {
  return repo.countByVotacion(votacionId);
}
