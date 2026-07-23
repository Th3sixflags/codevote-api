import { Request, Response } from 'express';
import { crearValidacionRequisitoSchema, actualizarValidacionRequisitoSchema } from '../schemas/validacion_requisito.schema.js';
import * as service from '../services/validacion_requisito.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarValidacionRequisito();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerValidacionRequisito(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Validación no encontrada.' });
    return;
  }
  res.json(registro);
}

export async function listarPorCandidato(req: Request, res: Response) {
  const registros = await service.listarPorCandidato(Number(req.params.candidatoId));
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearValidacionRequisitoSchema.parse(req.body);
  const nuevo = await service.crearValidacionRequisito(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarValidacionRequisitoSchema.parse(req.body);
  const actualizado = await service.actualizarValidacionRequisito(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Validación no encontrada.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarValidacionRequisito(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Validación no encontrada.' });
    return;
  }
  res.status(204).send();
}
