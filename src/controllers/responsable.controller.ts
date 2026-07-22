import { Request, Response } from 'express';
import { crearResponsableSchema, actualizarResponsableSchema } from '../schemas/responsable.schema';
import * as service from '../services/responsable.service';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarResponsable();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerResponsable(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Responsable no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function crear(req: Request, res: Response) {
  const data  = crearResponsableSchema.parse(req.body);
  const nuevo = await service.crearResponsable(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarResponsableSchema.parse(req.body);
  const actualizado = await service.actualizarResponsable(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Responsable no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarResponsable(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Responsable no encontrado.' });
    return;
  }
  res.status(204).send();
}
