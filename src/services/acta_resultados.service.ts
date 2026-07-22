import * as repo from '../repositories/acta_resultados.repository';
import { CrearActaResultadosDTO, ActualizarActaResultadosDTO } from '../schemas/acta_resultados.schema';

export async function listarActaResultados() {
  return repo.findAll();
}

export async function obtenerActaResultados(id: number) {
  const registro = await repo.findById(id);
  return registro ?? null;
}

export async function listarPorVotacion(id: number) {
  return repo.findByVotacion(id);
}

export async function crearActaResultados(data: CrearActaResultadosDTO) {
  return repo.create(data);
}

export async function actualizarActaResultados(id: number, data: ActualizarActaResultadosDTO) {
  const existente = await repo.findById(id);
  if (!existente) return null;
  return repo.update(id, data);
}

export async function eliminarActaResultados(id: number) {
  const existente = await repo.findById(id);
  if (!existente) return false;
  await repo.remove(id);
  return true;
}
