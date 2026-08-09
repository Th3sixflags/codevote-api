import { Request, Response } from 'express';
import * as service from '../services/superadmin.service.js';
import { loginSchema } from '../schemas/superadmin.schema.js';

export async function login(req: Request, res: Response) {
  const data = loginSchema.parse(req.body);
  const result = await service.login(data);
  res.json(result);
}

export async function dashboard(req: Request, res: Response) {
  const result = await service.dashboard();
  res.json(result);
}
