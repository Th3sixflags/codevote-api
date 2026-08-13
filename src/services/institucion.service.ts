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

export async function listarMiembrosParaAdministrar(id: number, buscar?: string) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  return repo.findMiembrosParaAdministrar(id, buscar?.trim() ?? '');
}

/** Promueve a un miembro activo de esta institución sin crear una cuenta nueva. */
export async function promoverMiembroAAdmin(id: number, cedula: string) {
  const inst = await repo.findById(id);
  if (!inst) throw new HttpError(404, 'Institución no encontrada.');
  if (!inst.activo) throw new HttpError(403, 'No se pueden asignar administradores a una institución suspendida.');

  const miembro = await repo.findMiembrosParaAdministrar(id, cedula);
  const encontrado = miembro.find((fila) => fila.cedula === cedula);
  if (!encontrado) throw new HttpError(404, 'El miembro no pertenece a esta institución.');
  if (encontrado.estado_academico !== 'activo') throw new HttpError(422, 'Solo se puede promover a miembros activos.');
  if (encontrado.rol === 'admin') throw new HttpError(409, 'Este miembro ya es administrador.');
  if (encontrado.rol !== 'estudiante') throw new HttpError(422, 'Solo los miembros con rol estudiante pueden ser promovidos a administrador.');

  const promovido = await repo.promoteMiembroAAdmin(id, cedula);
  if (!promovido) throw new HttpError(409, 'No se pudo promover al miembro; verifica que su estado no haya cambiado.');
  return { mensaje: 'Administrador asignado correctamente.', admin: { ...encontrado, rol: 'admin' } };
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
