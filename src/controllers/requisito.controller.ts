import { Request, Response } from 'express';
import { crearRequisitoSchema, actualizarRequisitoSchema } from '../schemas/requisito.schema';
import * as service from '../services/requisito.service';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarRequisito();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerRequisito(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Requisito no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function crear(req: Request, res: Response) {
  const data  = crearRequisitoSchema.parse(req.body);
  const nuevo = await service.crearRequisito(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarRequisitoSchema.parse(req.body);
  const actualizado = await service.actualizarRequisito(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Requisito no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarRequisito(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Requisito no encontrado.' });
    return;
  }
  res.status(204).send();
}
