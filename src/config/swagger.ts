import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

// En ESM no existe __dirname; se calcula a partir de la URL del módulo.
const aqui = dirname(fileURLToPath(import.meta.url));

// openapi.yaml vive en la raíz del proyecto (dos niveles arriba de dist/config).
const rutaSpec = join(aqui, '../../openapi.yaml');

/** Especificación OpenAPI de la API, cargada desde openapi.yaml. */
export const openapiSpec = parse(readFileSync(rutaSpec, 'utf8'));
