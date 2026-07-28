import * as repo from '../repositories/notificacion.repository.js';

export async function listarDeEstudiante(cedula: string) {
  return repo.findByEstudiante(cedula);
}

export async function marcarLeida(id: number, cedula: string) {
  const cambiada = await repo.marcarLeida(id, cedula);
  if (!cambiada) return null;
  return repo.findByIdYEstudiante(id, cedula);
}

// Las funciones que generan notificaciones son "best-effort": si fallan, se
// registra el error pero NO se interrumpe el flujo principal (votar, cerrar
// proceso), que es lo importante.

export async function notificar(cedula: string, tipo: string, titulo: string, mensaje: string) {
  try {
    await repo.crear(cedula, tipo, titulo, mensaje);
  } catch (err) {
    console.error('[notificacion] no se pudo crear la notificación', err);
  }
}

export async function notificarResultadosDeProceso(procesoId: number, nombreProceso: string) {
  try {
    await repo.crearParaVotantesDeProceso(
      procesoId,
      'resultados',
      'Resultados disponibles',
      `El proceso "${nombreProceso}" ha finalizado. Ya puedes consultar los resultados.`
    );
  } catch (err) {
    console.error('[notificacion] no se pudo notificar resultados', err);
  }
}
