import { Request, Response } from 'express';
import * as service from '../services/superadmin.service.js';



export async function dashboard(req: Request, res: Response) {
  const result = await service.dashboard();
  res.json(result);
}
