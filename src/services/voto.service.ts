import * as repo from '../repositories/voto.repository';
import { CrearVotoDTO } from '../schemas/voto.schema';

export async function registrarVoto(data: CrearVotoDTO) {
  return repo.create(data);
}

export async function obtenerResultados(votacionId: number) {
  return repo.countByVotacion(votacionId);
}
