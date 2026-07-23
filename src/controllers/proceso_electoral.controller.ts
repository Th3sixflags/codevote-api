import { Request, Response } from 'express';
import { crearProcesoSchema, actualizarProcesoSchema } from '../schemas/proceso_electoral.schema.js';
import * as service from '../services/proceso_electoral.service.js';

export async function listar(_req: Request, res: Response) {
  const procesos = await service.listarProcesos();
  res.json(procesos);
}

export async function obtener(req: Request, res: Response) {
  const proceso = await service.obtenerProceso(Number(req.params.id));
  if (!proceso) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.json(proceso);
}

export async function crear(req: Request, res: Response) {
  const data  = crearProcesoSchema.parse(req.body);
  const nuevo = await service.crearProceso(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarProcesoSchema.parse(req.body);
  const actualizado = await service.actualizarProceso(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarProceso(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Proceso electoral no encontrado.' });
    return;
  }
  res.status(204).send();
}
