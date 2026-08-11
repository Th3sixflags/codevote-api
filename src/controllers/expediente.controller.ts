import { Request, Response } from 'express';
import * as expedienteService from '../services/expediente.service.js';
import { HttpError } from '../utils/httpError.js';

export async function descargarExpediente(req: Request, res: Response) {
  const procesoId = parseInt(req.params.id as string, 10);
  if (isNaN(procesoId)) {
    throw new HttpError(400, 'ID de proceso inválido');
  }

  const institucionId = req.user?.fk_id_institucion;

  const pdfBuffer = await expedienteService.generarExpedientePDF(procesoId, institucionId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=expediente-proceso-${procesoId}.pdf`);
  res.send(pdfBuffer);
}
