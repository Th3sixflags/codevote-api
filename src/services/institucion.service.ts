import * as repo from '../repositories/institucion.repository.js';
import { CrearInstitucionDTO, ActualizarInstitucionDTO } from '../schemas/institucion.schema.js';
import { HttpError } from '../utils/httpError.js';

export async function listar() {
  return await repo.findAll();
}

export async function obtenerPorId(id: number) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  return inst;
}

export async function obtenerPorSlug(slug: string) {
  const inst = await repo.findBySlug(slug);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  return inst;
}

export async function crear(data: CrearInstitucionDTO) {
  const id = await repo.create(data);
  return await obtenerPorId(id);
}

export async function actualizar(id: number, data: ActualizarInstitucionDTO) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  
  await repo.update(id, data);
  return await obtenerPorId(id);
}

export async function toggleActivo(id: number) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  
  await repo.toggleActivo(id);
  return { mensaje: `Institución ${inst.activo ? 'desactivada' : 'activada'} correctamente.` };
}

export async function obtenerEstadisticas(id: number) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  
  return await repo.countStats(id);
}

export async function obtenerAdmins(id: number) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  
  return await repo.findAdmins(id);
}
