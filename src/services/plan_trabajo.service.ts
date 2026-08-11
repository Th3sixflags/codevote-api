import * as repo from '../repositories/plan_trabajo.repository.js';
import * as listaRepo from '../repositories/lista_candidata.repository.js';
import { CrearPlanTrabajoDTO, ActualizarPlanTrabajoDTO } from '../schemas/plan_trabajo.schema.js';
import { HttpError } from '../utils/httpError.js';
import { validarFase } from './proceso_electoral.service.js';

export async function listarPlanTrabajo(institucionId?: number) {
  return repo.findAll(institucionId);
}

export async function obtenerPlanTrabajo(id: number, institucionId?: number) {
  const registro = await repo.findById(id, institucionId);
  return registro ?? null;
}

export async function listarPorLista(id: number, institucionId?: number) {
  return repo.findByLista(id, institucionId);
}

export async function crearPlanTrabajo(data: CrearPlanTrabajoDTO, institucionId?: number) {
  const lista = await listaRepo.findById(data.fk_id_lista, institucionId);
  if (!lista) {
    throw new HttpError(404, 'La lista indicada no existe o pertenece a otra institución.');
  }

  await validarFase(lista.id_proceso || lista.fk_id_proceso, ['inscripcion'], institucionId);
  return repo.create(data);
}

export async function actualizarPlanTrabajo(id: number, data: ActualizarPlanTrabajoDTO, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return null;

  const lista = await listaRepo.findById(existente.fk_id_lista, institucionId);
  if (lista) {
    await validarFase(lista.id_proceso || lista.fk_id_proceso, ['inscripcion'], institucionId);
  }
  return repo.update(id, data);
}

export async function eliminarPlanTrabajo(id: number, institucionId?: number) {
  const existente = await repo.findById(id, institucionId);
  if (!existente) return false;

  const lista = await listaRepo.findById(existente.fk_id_lista, institucionId);
  if (lista) {
    await validarFase(lista.id_proceso || lista.fk_id_proceso, ['inscripcion'], institucionId);
  }
  await repo.remove(id);
  return true;
}
