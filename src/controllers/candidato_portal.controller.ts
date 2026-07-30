import { Request, Response, NextFunction } from 'express';
import * as service from '../services/candidato_portal.service.js';
import { urlPublicaDePlan, MAX_BYTES_PDF } from '../config/uploads.js';
import {
  crearListaCandidatoSchema, actualizarListaCandidatoSchema,
  agregarCandidatoSchema, actualizarCandidatoPortalSchema,
  agregarPlanSchema, actualizarPlanSchema,
} from '../schemas/candidato_portal.schema.js';

/** GET /candidato/mi-lista */
export async function miLista(req: Request, res: Response) {
  const lista = await service.obtenerMiLista(req.user!.sub);
  res.json(lista); // null si aún no tiene lista
}

/** POST /candidato/listas */
export async function crearLista(req: Request, res: Response) {
  const data  = crearListaCandidatoSchema.parse(req.body);
  const lista = await service.crearLista(req.user!.sub, data);
  res.status(201).json(lista);
}

/** PATCH /candidato/listas/:id */
export async function actualizarLista(req: Request, res: Response) {
  const data  = actualizarListaCandidatoSchema.parse(req.body);
  const lista = await service.actualizarLista(req.user!.sub, Number(req.params.id), data);
  res.json(lista);
}

/** POST /candidato/listas/:id/candidatos */
export async function agregarCandidato(req: Request, res: Response) {
  const data      = agregarCandidatoSchema.parse(req.body);
  const candidato = await service.agregarCandidato(req.user!.sub, Number(req.params.id), data);
  res.status(201).json(candidato);
}

/** PATCH /candidato/candidatos/:id */
export async function actualizarCandidato(req: Request, res: Response) {
  const data      = actualizarCandidatoPortalSchema.parse(req.body);
  const candidato = await service.actualizarCandidato(req.user!.sub, Number(req.params.id), data);
  res.json(candidato);
}

/** DELETE /candidato/candidatos/:id */
export async function eliminarCandidato(req: Request, res: Response) {
  await service.eliminarCandidato(req.user!.sub, Number(req.params.id));
  res.status(204).send();
}

/** POST /candidato/listas/:id/planes */
export async function agregarPlan(req: Request, res: Response) {
  const data = agregarPlanSchema.parse(req.body);
  const plan = await service.agregarPlan(req.user!.sub, Number(req.params.id), data);
  res.status(201).json(plan);
}

/** PATCH /candidato/planes/:id */
export async function actualizarPlan(req: Request, res: Response) {
  const data = actualizarPlanSchema.parse(req.body);
  const plan = await service.actualizarPlan(req.user!.sub, Number(req.params.id), data);
  res.json(plan);
}

/** POST /candidato/listas/:id/enviar-revision */
export async function enviarARevision(req: Request, res: Response) {
  const lista = await service.enviarARevision(req.user!.sub, Number(req.params.id));
  res.json(lista);
}

/** GET /candidato/estudiantes?buscar=texto — posibles integrantes. */
export async function buscarIntegrantes(req: Request, res: Response) {
  const texto = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
  if (texto.length < 2) {
    res.status(422).json({ error: 'Indica al menos 2 caracteres en el parámetro "buscar".' });
    return;
  }
  const encontrados = await service.buscarIntegrantes(req.user!.sub, texto);
  res.json(encontrados);
}

/**
 * POST /candidato/listas/:listaId/planes/archivo — adjunta el PDF del plan.
 * El archivo llega en el campo "archivo" (multipart/form-data). Se puede indicar
 * id_plan si la lista tiene varios planes de trabajo.
 */
export async function subirArchivoPlan(req: Request, res: Response) {
  const archivo = (req as any).file as { filename: string } | undefined;
  if (!archivo) {
    res.status(422).json({ error: 'Adjunta el PDF en el campo "archivo".' });
    return;
  }

  const idPlanCrudo = (req.body as any)?.id_plan;
  const idPlan = idPlanCrudo === undefined || idPlanCrudo === '' ? undefined : Number(idPlanCrudo);
  if (idPlan !== undefined && !Number.isInteger(idPlan)) {
    res.status(422).json({ error: 'id_plan debe ser un número entero.' });
    return;
  }

  const resultado = await service.guardarArchivoDePlan(
    req.user!.sub, Number(req.params.listaId), urlPublicaDePlan(archivo.filename), idPlan
  );
  res.status(201).json(resultado);
}

/**
 * Traduce los errores de multer a respuestas claras. Se registra como manejador
 * de errores propio de la ruta de subida.
 */
export function errorDeSubida(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err?.message === 'TIPO_NO_PDF') {
    res.status(422).json({ error: 'Solo se admiten archivos PDF (application/pdf).' });
    return;
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(422).json({ error: `El PDF supera el tamaño máximo de ${MAX_BYTES_PDF / (1024 * 1024)} MB.` });
    return;
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(422).json({ error: 'Envía un único archivo en el campo "archivo".' });
    return;
  }
  next(err);
}
