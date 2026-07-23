import { Request, Response } from 'express';
import { crearCarreraSchema, actualizarCarreraSchema } from '../schemas/carrera.schema.js';
import * as service from '../services/carrera.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarCarrera();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerCarrera(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Carrera no encontrada.' });
    return;
  }
  res.json(registro);
}

export async function crear(req: Request, res: Response) {
  const data  = crearCarreraSchema.parse(req.body);
  const nuevo = await service.crearCarrera(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarCarreraSchema.parse(req.body);
  const actualizado = await service.actualizarCarrera(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Carrera no encontrada.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarCarrera(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Carrera no encontrada.' });
    return;
  }
  res.status(204).send();
}
