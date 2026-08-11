import { Request, Response } from 'express';
import * as service from '../services/importacion.service.js';
import { confirmarImportacionSchema } from '../schemas/importacion.schema.js';
import { HttpError } from '../utils/httpError.js';

export async function previsualizar(req: Request, res: Response) {
  if (!req.file) {
    throw new HttpError(422, 'Debe incluir un archivo CSV en el campo "archivo".');
  }

  // Si es SuperAdmin puede enviar ?institucion=ID
  let institucionId = req.user!.fk_id_institucion;
  if (req.user!.rol === 'superadmin' && req.query.institucion) {
    institucionId = Number(req.query.institucion);
  }

  if (!institucionId) {
    throw new HttpError(400, 'Debe especificar una institución.');
  }

  const resultado = await service.previsualizarCSV(req.file.buffer, req.file.originalname, institucionId);
  res.json(resultado);
}

export async function confirmar(req: Request, res: Response) {
  const { previewToken } = confirmarImportacionSchema.parse(req.body);
  
  let institucionId = req.user!.fk_id_institucion;
  if (req.user!.rol === 'superadmin' && req.query.institucion) {
    institucionId = Number(req.query.institucion);
  }

  if (!institucionId) {
    throw new HttpError(400, 'Debe especificar una institución.');
  }

  const resultado = await service.confirmarImportacion(previewToken, institucionId, req.user!.sub);
  res.json(resultado);
}

export async function listarHistorial(req: Request, res: Response) {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  let institucionId = req.user!.fk_id_institucion;
  if (req.user!.rol === 'superadmin' && req.query.institucion) {
    institucionId = Number(req.query.institucion);
  }

  if (!institucionId) {
    throw new HttpError(400, 'Debe especificar una institución.');
  }

  const historial = await service.listarHistorial(institucionId, limit, offset);
  res.json(historial);
}

export async function descargarErrores(req: Request, res: Response) {
  const idImportacion = parseInt(req.params.id as string);
  
  let institucionId = req.user!.fk_id_institucion;
  if (req.user!.rol === 'superadmin' && req.query.institucion) {
    institucionId = Number(req.query.institucion);
  }

  if (!institucionId) {
    throw new HttpError(400, 'Debe especificar una institución.');
  }

  const errores = await service.descargarErrores(idImportacion, institucionId);
  res.json(errores);
}
