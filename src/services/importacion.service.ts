import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import * as repo from '../repositories/importacion.repository.js';
import { obtenerPorId } from './institucion.service.js';
import { filaCsvSchema, FilaCsvDTO } from '../schemas/importacion.schema.js';
import { HttpError } from '../utils/httpError.js';

interface PreviewCache {
  filasValidas: repo.FilaValida[];
  institucionId: number;
  nombreArchivo: string;
  expira: number;
}

// Caché en memoria para las vistas previas (TTL 15 min)
const previewCaché = new Map<string, PreviewCache>();

/** Limpia el caché de entradas expiradas */
function limpiarCaché() {
  const ahora = Date.now();
  for (const [key, val] of previewCaché.entries()) {
    if (val.expira < ahora) {
      previewCaché.delete(key);
    }
  }
}

export async function previsualizarCSV(buffer: Buffer, nombreArchivo: string, institucionId: number) {
  const institucion = await obtenerPorId(institucionId);
  const config = institucion.config_json || {};
  const dominioRequerido = config.dominio_email;

  const contenido = buffer.toString('utf-8');
  let records: any[];
  try {
    // Intenta detectar si usa comas o punto y coma probando ambos.
    // Usamos el parser síncrono para simplicidad, asumiendo CSVs manejables.
    const delimiter = contenido.indexOf(';') !== -1 && contenido.split(';').length > contenido.split(',').length ? ';' : ',';
    records = parse(contenido, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter
    });
  } catch (err: any) {
    throw new HttpError(422, 'El archivo no es un CSV válido: ' + err.message);
  }

  if (records.length === 0) {
    throw new HttpError(422, 'El archivo CSV está vacío.');
  }

  // Normalizar nombres de columnas eliminando espacios y poniéndolas en minúsculas
  const firstRecord = records[0];
  const keys = Object.keys(firstRecord);
  const requiredCols = ['identificador', 'nombres', 'apellidos', 'correo'];
  
  // Mapear columnas reales a las esperadas
  const colMap: Record<string, string> = {};
  for (const key of keys) {
    const norm = key.toLowerCase().trim();
    if (norm === 'identificador' || norm === 'cedula' || norm === 'id') colMap[key] = 'identificador';
    else if (norm === 'nombres' || norm === 'nombre') colMap[key] = 'nombres';
    else if (norm === 'apellidos' || norm === 'apellido') colMap[key] = 'apellidos';
    else if (norm === 'correo' || norm === 'email') colMap[key] = 'correo';
    else if (norm === 'division' || norm === 'carrera' || norm === 'facultad') colMap[key] = 'division';
    else if (norm === 'estado') colMap[key] = 'estado';
    else if (norm === 'fecha_ingreso') colMap[key] = 'fecha_ingreso';
    else if (norm === 'membresia_activa' || norm === 'activo') colMap[key] = 'membresia_activa';
  }

  const missing = requiredCols.filter(c => !Object.values(colMap).includes(c));
  if (missing.length > 0) {
    throw new HttpError(422, `Faltan columnas requeridas en el CSV: ${missing.join(', ')}`);
  }

  const carrerasMap = await repo.mapCarreras(institucionId);
  const idsInCsv = new Set<string>();
  const correosInCsv = new Set<string>();
  
  const validas: repo.FilaValida[] = [];
  const errores: any[] = [];
  let duplicadas = 0;

  // Recopilar todos los identificadores y correos para chequear contra DB masivamente
  const allIds = [];
  const allCorreos = [];
  
  for (const row of records) {
    const mappedRow: any = {};
    for (const key in row) {
      if (colMap[key]) mappedRow[colMap[key]] = row[key];
    }
    if (mappedRow.identificador) allIds.push(mappedRow.identificador);
    if (mappedRow.correo) allCorreos.push(mappedRow.correo);
  }

  const existingIds = await repo.buscarIdentificadoresExistentes(allIds, institucionId);
  const existingCorreos = await repo.buscarCorreosExistentes(allCorreos, institucionId);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const fila = i + 2; // +1 for 0-index, +1 for header
    
    // Mapear la fila al formato esperado
    const mappedRow: any = {};
    for (const key in row) {
      if (colMap[key]) mappedRow[colMap[key]] = row[key];
    }

    // Validar esquema básico
    const parseResult = filaCsvSchema.safeParse(mappedRow);
    if (!parseResult.success) {
      errores.push({
        fila,
        identificador: mappedRow.identificador,
        motivo: parseResult.error.errors.map(e => e.message).join(' | ')
      });
      continue;
    }

    const data = parseResult.data;

    // Duplicado en el mismo archivo
    if (idsInCsv.has(data.identificador)) {
      duplicadas++;
      errores.push({ fila, identificador: data.identificador, motivo: 'Identificador duplicado dentro del archivo CSV.' });
      continue;
    }
    
    if (correosInCsv.has(data.correo)) {
      duplicadas++;
      errores.push({ fila, identificador: data.identificador, motivo: 'Correo duplicado dentro del archivo CSV.' });
      continue;
    }

    // Duplicado en DB
    if (existingIds.has(data.identificador)) {
      duplicadas++;
      errores.push({ fila, identificador: data.identificador, motivo: 'La persona ya pertenece a esta institución.' });
      continue;
    }
    if (existingCorreos.has(data.correo)) {
      duplicadas++;
      errores.push({ fila, identificador: data.identificador, motivo: 'El correo ya está registrado en el sistema.' });
      continue;
    }

    // Validación de dominio (si la institución lo exige)
    if (dominioRequerido && !data.correo.toLowerCase().endsWith(`@${dominioRequerido.toLowerCase()}`)) {
      errores.push({ fila, identificador: data.identificador, motivo: `El correo debe pertenecer al dominio @${dominioRequerido}` });
      continue;
    }

    idsInCsv.add(data.identificador);
    correosInCsv.add(data.correo);

    let idCarrera: number | null = null;
    if (data.division) {
      const match = carrerasMap[data.division.trim().toLowerCase()];
      if (match) {
        idCarrera = match;
      } else {
        errores.push({ fila, identificador: data.identificador, motivo: `La división/carrera '${data.division}' no existe en el sistema.` });
        continue;
      }
    }

    let isMembresiaActiva = 1;
    if (data.membresia_activa !== undefined) {
      isMembresiaActiva = data.membresia_activa === true || data.membresia_activa === 'true' || data.membresia_activa === '1' || String(data.membresia_activa).toLowerCase() === 'si' ? 1 : 0;
    }

    validas.push({
      identificador: data.identificador,
      nombres: data.nombres,
      apellidos: data.apellidos,
      correo: data.correo,
      fk_id_carrera: idCarrera,
      estado_academico: data.estado,
      fecha_ingreso: data.fecha_ingreso || null,
      membresia_activa: isMembresiaActiva
    });
  }

  const previewToken = randomUUID();
  limpiarCaché(); // Limpiar entradas expiradas antes de añadir una nueva
  
  // Guardamos solo si hay válidas para no ocupar memoria inútilmente
  if (validas.length > 0) {
    previewCaché.set(previewToken, {
      filasValidas: validas,
      institucionId,
      nombreArchivo,
      expira: Date.now() + 15 * 60 * 1000 // 15 minutos
    });
  }

  return {
    previewToken: validas.length > 0 ? previewToken : null,
    total: records.length,
    validas: validas.length,
    invalidas: errores.length - duplicadas,
    duplicadas,
    errores: errores.slice(0, 100) // Solo mostrar los primeros 100 en la vista previa
  };
}

export async function confirmarImportacion(previewToken: string, institucionId: number, cedulaImportador: string) {
  const cacheData = previewCaché.get(previewToken);
  
  if (!cacheData || cacheData.institucionId !== institucionId) {
    throw new HttpError(404, 'La vista previa ha expirado o es inválida. Por favor, sube el archivo de nuevo.');
  }

  await repo.insertarMiembros(cacheData.filasValidas, institucionId);
  
  const idImportacion = await repo.crearHistorial({
    fk_id_institucion: institucionId,
    cedula_importador: cedulaImportador,
    nombre_archivo: cacheData.nombreArchivo,
    total_filas: cacheData.filasValidas.length, // Only valid ones were imported
    filas_importadas: cacheData.filasValidas.length,
    filas_rechazadas: 0, // In this model, they already saw the rejects
    filas_duplicadas: 0,
    errores_json: null
  });

  // Borrar del caché para evitar doble confirmación
  previewCaché.delete(previewToken);

  return {
    mensaje: 'Importación completada con éxito.',
    id_importacion: idImportacion,
    filas_importadas: cacheData.filasValidas.length
  };
}

export async function listarHistorial(institucionId: number, limit = 20, offset = 0) {
  return await repo.findHistorial(institucionId, limit, offset);
}

export async function descargarErrores(idImportacion: number, institucionId: number) {
  const historial = await repo.findHistorialById(idImportacion, institucionId);
  if (!historial) {
    throw new HttpError(404, 'Registro de importación no encontrado.');
  }
  return historial.errores_json || [];
}
