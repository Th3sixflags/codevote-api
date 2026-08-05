import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { subirImagen, urlPublicaDeImagen, MAX_BYTES_IMAGEN, TIPOS_IMAGEN } from '../config/uploads.js';

/**
 * Subida de imágenes: fotos de perfil, de una lista, de un proceso o de una
 * papeleta.
 *
 * Es un endpoint ÚNICO y genérico a propósito. Devuelve la URL y no toca ningún
 * registro: quien sube la imagen decide después dónde la guarda (PATCH /perfil/foto,
 * el formulario del proceso, el de la lista...). Así no hace falta un endpoint
 * de subida por cada entidad que tenga foto, ni permisos distintos en cada uno.
 *
 * Basta con estar autenticado: cualquiera necesita poder cambiar SU foto de
 * perfil. El daño posible se acota con el tamaño máximo (5 MB), un solo archivo
 * por petición, la lista cerrada de formatos y el límite global de peticiones
 * por IP.
 *
 * A diferencia del PDF de las propuestas, aquí no se comprueba la propiedad de
 * nada porque todavía no hay nada a lo que pertenezca: la imagen no queda
 * asociada a ningún registro hasta que se guarda su URL, y ese paso sí tiene sus
 * propios controles.
 */
const router = Router();

/** POST /api/uploads/imagen — sube una imagen y devuelve su URL pública. */
router.post(
  '/imagen',
  requireAuth,
  subirImagen,
  (req: Request, res: Response) => {
    const archivo = (req as any).file as { filename: string } | undefined;
    if (!archivo) {
      res.status(422).json({ error: 'Adjunta la imagen en el campo "imagen".' });
      return;
    }
    res.status(201).json({ url: urlPublicaDeImagen(archivo.filename) });
  },
  /** Traduce los errores de multer a mensajes que se puedan mostrar tal cual. */
  (err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err?.message === 'TIPO_NO_IMAGEN') {
      const formatos = Object.values(TIPOS_IMAGEN).join(', ');
      res.status(422).json({ error: `Formato no admitido. Sube una imagen ${formatos.toUpperCase()}.` });
      return;
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(422).json({ error: `La imagen supera el tamaño máximo de ${MAX_BYTES_IMAGEN / (1024 * 1024)} MB.` });
      return;
    }
    if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(422).json({ error: 'Envía una única imagen en el campo "imagen".' });
      return;
    }
    next(err);
  },
);

export default router;
