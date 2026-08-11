import * as repo from '../repositories/acta_resultados.repository.js';
import { CrearActaResultadosDTO, ActualizarActaResultadosDTO } from '../schemas/acta_resultados.schema.js';

export async function listarActaResultados(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerActaResultados(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

export async function listarPorVotacion(id: number, institucionId?: number) {
  return repo.findByVotacion(id, institucionId);
}

export async function crearActaResultados(data: CrearActaResultadosDTO) {
  return repo.create(data);
}

export async function actualizarActaResultados(id: number, data: ActualizarActaResultadosDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarActaResultados(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
