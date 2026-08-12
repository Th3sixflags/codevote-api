import * as repo from '../repositories/institucion.repository.js';
import { CrearInstitucionDTO, ActualizarInstitucionDTO, AsignarAdminDTO } from '../schemas/institucion.schema.js';
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

export async function asignarAdmin(id: number, adminData: AsignarAdminDTO) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  if (!inst.activo) throw new HttpError(403, 'No se pueden asignar administradores a una institución suspendida.');
  
  try {
    await repo.assignAdmin(id, adminData);
    return {
      mensaje: 'Administrador asignado correctamente.',
      admin: {
        cedula: adminData.cedula,
        nombres: adminData.nombres,
        apellidos: adminData.apellidos,
        correo_institucional: adminData.correo_institucional,
        rol: 'admin'
      }
    };
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'El identificador o correo ya están registrados en el sistema.');
    }
    throw error;
  }
}
