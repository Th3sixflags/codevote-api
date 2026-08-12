import { Request, Response } from 'express';
import { crearEstudianteSchema, actualizarEstudianteSchema } from '../schemas/estudiante.schema.js';
import * as service from '../services/estudiante.service.js';
import { esAdministracion } from '../utils/accesoCarrera.js';
import { institucionDeSesion } from '../utils/institucion.js';

export async function listar(req: Request, res: Response) {
  // Multi-tenant: cada admin solo ve los miembros de su institución.
  const institucionId = institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion);
  const estudiantes = await service.listarEstudiantes(institucionId);
  res.json(estudiantes);
}

export async function obtener(req: Request, res: Response) {
  const cedula = req.params.cedula as string;

  // Datos personales (correo, promedio): solo el admin o el propio estudiante.
  // Evita que cualquier usuario autenticado consulte el perfil de otro.
  if (!esAdministracion(req.user!.rol) && req.user!.sub !== cedula) {
    res.status(403).json({ error: 'No tienes permiso para ver este perfil.' });
    return;
  }

  const institucionId = institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion);
  const estudiante = await service.obtenerEstudiante(cedula, institucionId);
  if (!estudiante) {
    res.status(404).json({ error: 'Estudiante no encontrado.' });
    return;
  }
  res.json(estudiante);
}

export async function crear(req: Request, res: Response) {
  const data  = crearEstudianteSchema.parse(req.body);
  try {
    const nuevo = await service.crearEstudiante(data, req.user?.fk_id_institucion);
    res.status(201).json(nuevo);
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'La cédula o correo ya están registrados.' });
      return;
    }
    throw err;
  }
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarEstudianteSchema.parse(req.body);
  const institucionId = institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion);
  const actualizado = await service.actualizarEstudiante(
    req.params.cedula as string,
    data,
    institucionId
  );
  if (!actualizado) {
    res.status(404).json({ error: 'Estudiante no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const institucionId = institucionDeSesion(req.user?.rol, req.user?.fk_id_institucion);
  const eliminado = await service.eliminarEstudiante(
    req.params.cedula as string,
    institucionId
  );
  if (!eliminado) {
    res.status(404).json({ error: 'Estudiante no encontrado.' });
    return;
  }
  res.status(204).send();
}
