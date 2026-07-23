import * as repo from '../repositories/voto.repository.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

export async function registrarVoto(data: CrearVotoDTO) {
  return repo.create(data);
}

export async function obtenerResultados(votacionId: number) {
  return repo.countByVotacion(votacionId);
}
