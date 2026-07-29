import { Request, Response } from 'express';
import { crearCodigoVotoSchema, actualizarCodigoVotoSchema } from '../schemas/codigo_voto.schema.js';
import * as service from '../services/codigo_voto.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarCodigoVoto();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerCodigoVoto(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Código de voto no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function listarPorVotacion(req: Request, res: Response) {
  const registros = await service.listarPorVotacion(Number(req.params.votacionId));
  res.json(registros);
}

/** Comprobantes del usuario autenticado. No requiere rol admin. */
export async function listarMisCodigos(req: Request, res: Response) {
  const registros = await service.listarPorEstudiante(req.user!.sub);
  res.json(registros);
}

/**
 * Verifica un comprobante propio. Protegido por propiedad: si el comprobante no
 * existe o pertenece a otro estudiante se responde 404 por igual, para no
 * revelar la existencia de comprobantes ajenos.
 */
export async function verificarMiCodigo(req: Request, res: Response) {
  const verificacion = await service.verificarMiComprobante(Number(req.params.id), req.user!.sub);
  if (!verificacion) {
    res.status(404).json({ error: 'Comprobante no encontrado.' });
    return;
  }
  res.json(verificacion);
}

export async function crear(req: Request, res: Response) {
  const data  = crearCodigoVotoSchema.parse(req.body);
  const nuevo = await service.crearCodigoVoto(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarCodigoVotoSchema.parse(req.body);
  const actualizado = await service.actualizarCodigoVoto(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Código de voto no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarCodigoVoto(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Código de voto no encontrado.' });
    return;
  }
  res.status(204).send();
}
