import * as repo from '../repositories/estudiante.repository.js';

/** Actualiza la foto de perfil del usuario (cadena vacía = quitarla). */
/** El esquema ya normaliza la cadena vacía a null ("sin foto"). */
export async function actualizarFoto(cedula: string, fotoUrl: string | null, institucionId?: number) {
  return repo.updateFoto(cedula, fotoUrl || null, institucionId);
}
