import { Request, Response } from 'express';
import * as service from '../services/institucion.service.js';
import { crearInstitucionSchema, actualizarInstitucionSchema } from '../schemas/institucion.schema.js';

export async function listar(req: Request, res: Response) {
  const instituciones = await service.listar();
  res.json(instituciones);
}

export async function obtenerPorId(req: Request, res: Response) {
  const id = Number(req.params.id);
  const institucion = await service.obtenerPorId(id);
  res.json(institucion);
}

export async function obtenerPorSlug(req: Request, res: Response) {
  const slug = req.params.slug as string;
  const institucion = await service.obtenerPorSlug(slug);
  res.json(institucion);
}

export async function crear(req: Request, res: Response) {
  const data = crearInstitucionSchema.parse(req.body);
  const institucion = await service.crear(data);
  res.status(201).json(institucion);
}

export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const data = actualizarInstitucionSchema.parse(req.body);
  const institucion = await service.actualizar(id, data);
  res.json(institucion);
}

export async function toggleActivo(req: Request, res: Response) {
  const id = Number(req.params.id);
  const resultado = await service.toggleActivo(id);
  res.json(resultado);
}

export async function obtenerEstadisticas(req: Request, res: Response) {
  const id = Number(req.params.id);
  const stats = await service.obtenerEstadisticas(id);
  res.json(stats);
}

export async function obtenerAdmins(req: Request, res: Response) {
  const id = Number(req.params.id);
  const admins = await service.obtenerAdmins(id);
  res.json(admins);
}
