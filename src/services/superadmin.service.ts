import jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'crypto';
import * as repo from '../repositories/superadmin.repository.js';
import { LoginDTO } from '../schemas/superadmin.schema.js';
import { HttpError } from '../utils/httpError.js';

function hashear(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function hashesIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function login(data: LoginDTO) {
  const superadmin = await repo.findByCorreo(data.correo);
  if (!superadmin || !superadmin.activo) {
    throw new HttpError(401, 'Credenciales inválidas o cuenta desactivada.');
  }

  const passwordHash = hashear(data.password);
  if (!hashesIguales(superadmin.password_hash, passwordHash)) {
    throw new HttpError(401, 'Credenciales inválidas o cuenta desactivada.');
  }

  const token = jwt.sign(
    { sub: String(superadmin.id_superadmin), email: superadmin.correo, rol: 'superadmin' },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any }
  );

  return {
    token,
    usuario: {
      id_superadmin: superadmin.id_superadmin,
      nombres: superadmin.nombres,
      apellidos: superadmin.apellidos,
      correo: superadmin.correo,
      rol: 'superadmin',
    },
  };
}

export async function dashboard() {
  const [instituciones, procesosActivos, miembrosTotal, votosTotal] = await Promise.all([
    repo.countInstituciones(),
    repo.countProcesosActivos(),
    repo.countMiembrosTotal(),
    repo.countVotosTotal(),
  ]);

  return {
    instituciones,
    procesosActivos,
    miembrosTotal,
    votosTotal,
  };
}
