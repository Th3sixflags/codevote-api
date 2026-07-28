import * as repo from '../repositories/voto.repository.js';
import { CrearVotoDTO } from '../schemas/voto.schema.js';

export async function yaVoto(votacionId: number, cedula: string) {
  return repo.yaVotoEstudiante(votacionId, cedula);
}

export async function registrarVoto(data: CrearVotoDTO, cedula: string) {
  return repo.createConComprobante(data, cedula);
}

export async function estadoResultados(votacionId: number) {
  return repo.estadoDeVotacion(votacionId);
}

export async function obtenerResultados(votacionId: number) {
  return repo.countByVotacion(votacionId);
}
