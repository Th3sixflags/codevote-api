import { Request, Response } from 'express';
import { crearFacultadSchema, actualizarFacultadSchema } from '../schemas/facultad.schema';
import * as service from '../services/facultad.service';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarFacultad();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerFacultad(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Facultad no encontrada.' });
    return;
  }
  res.json(registro);
}

export async function crear(req: Request, res: Response) {
  const data  = crearFacultadSchema.parse(req.body);
  const nuevo = await service.crearFacultad(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarFacultadSchema.parse(req.body);
  const actualizado = await service.actualizarFacultad(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Facultad no encontrada.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarFacultad(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Facultad no encontrada.' });
    return;
  }
  res.status(204).send();
}
