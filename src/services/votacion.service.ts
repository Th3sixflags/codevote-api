import * as repo from '../repositories/votacion.repository';

export async function listarVotaciones() {
  return repo.findAll();
}

export async function obtenerVotacion(id: number) {
  const votacion = await repo.findById(id);
  return votacion ?? null;
}

export async function listarPorProceso(procesoId: number) {
  return repo.findByProceso(procesoId);
}
