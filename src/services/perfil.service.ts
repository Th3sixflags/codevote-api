import bcrypt from 'bcryptjs';
import * as repo from '../repositories/estudiante.repository.js';
import { HttpError } from '../utils/httpError.js';

/** Actualiza la foto de perfil del usuario (cadena vacía = quitarla). */
export async function actualizarFoto(cedula: string, fotoUrl: string) {
  return repo.updateFoto(cedula, fotoUrl === '' ? null : fotoUrl);
}

/**
 * Cambia la contraseña del propio usuario. Exige la contraseña actual correcta
 * antes de reemplazarla, para que un token robado no baste para secuestrar la
 * cuenta cambiando la clave.
 */
export async function cambiarPassword(cedula: string, actual: string, nueva: string) {
  const hash = await repo.getPasswordHash(cedula);
  if (!hash) throw new HttpError(404, 'Usuario no encontrado.');

  const coincide = await bcrypt.compare(actual, hash);
  if (!coincide) throw new HttpError(400, 'La contraseña actual es incorrecta.');

  const nuevoHash = await bcrypt.hash(nueva, 12);
  await repo.updatePasswordHash(cedula, nuevoHash);
}
