/**
 * Subida de imágenes (perfil, listas, procesos, papeletas).
 *
 * Existe para que nadie tenga que buscar y pegar una URL: se elige el archivo y
 * el endpoint devuelve la ruta que después se guarda en `foto_url`.
 *
 * Lo que se comprueba:
 *   - exige sesión;
 *   - solo admite los formatos de la lista cerrada, y NUNCA SVG (puede llevar
 *     JavaScript y se serviría desde el mismo dominio que la aplicación);
 *   - respeta el tamaño máximo;
 *   - guarda con nombre y extensión propios, sin fiarse del nombre del cliente;
 *   - la ruta que devuelve es exactamente la que aceptan los esquemas de imagen.
 */
process.env.JWT_SECRET = 'secreto-de-prueba';

import assert from 'node:assert/strict';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import uploadRoutes from '../src/routes/upload.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  DIRECTORIO_UPLOADS, SUBRUTA_IMAGENES, MAX_BYTES_IMAGEN,
} from '../src/config/uploads.js';
import { urlImagenHttpsSchema } from '../src/schemas/common.js';

const app = express();
app.use('/api/uploads', uploadRoutes);
app.use(errorHandler);

let servidor: ReturnType<typeof app.listen>;
let baseUrl = '';

const TOKEN = jwt.sign(
  { sub: '1105946139', email: 'ana@uide.edu.ec', rol: 'estudiante' },
  process.env.JWT_SECRET!,
);

const directorio = path.join(DIRECTORIO_UPLOADS, SUBRUTA_IMAGENES);
const subidas: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    servidor = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await pool.end();
  for (const archivo of subidas) rmSync(path.join(directorio, archivo), { force: true });
});

async function subir(
  contenido: Uint8Array | string, tipo: string, nombre = 'foto.jpg', conSesion = true
) {
  const formulario = new FormData();
  formulario.append('imagen', new Blob([contenido], { type: tipo }), nombre);

  const respuesta = await fetch(`${baseUrl}/api/uploads/imagen`, {
    method: 'POST',
    headers: conSesion ? { Authorization: `Bearer ${TOKEN}` } : {},
    body: formulario,
  });
  const texto = await respuesta.text();
  const cuerpo = texto ? JSON.parse(texto) : null;
  if (cuerpo?.url) subidas.push(path.basename(cuerpo.url));
  return { http: respuesta.status, cuerpo };
}

/** Cabecera mínima de un PNG, para que el contenido sea coherente con el tipo. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// --- Sesión ------------------------------------------------------------------

test('sin sesión no se puede subir nada: 401', async () => {
  const { http } = await subir(PNG, 'image/png', 'foto.png', false);
  assert.equal(http, 401);
});

// --- Formatos ----------------------------------------------------------------

test('acepta JPG, PNG y WEBP', async () => {
  for (const [tipo, extension] of [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]) {
    const { http, cuerpo } = await subir(PNG, tipo, `foto.${extension}`);

    assert.equal(http, 201, `no admitió ${tipo}`);
    assert.match(cuerpo.url, new RegExp(String.raw`^/api/uploads/imagenes/[\w-]+\.${extension}$`));
  }
});

test('rechaza un SVG aunque sea una imagen', async () => {
  // Un SVG puede llevar <script> dentro y se serviría desde el mismo dominio
  // que la aplicación: sería un XSS almacenado.
  const { http, cuerpo } = await subir('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml', 'x.svg');

  assert.equal(http, 422);
  assert.match(cuerpo.error, /formato no admitido/i);
});

test('rechaza lo que no es una imagen', async () => {
  for (const tipo of ['application/pdf', 'text/html', 'application/javascript', 'text/plain']) {
    const { http } = await subir('contenido', tipo, 'archivo.png');
    assert.equal(http, 422, `admitió ${tipo}`);
  }
});

// --- Tamaño -------------------------------------------------------------------

test('rechaza una imagen de más de 5 MB', async () => {
  const { http, cuerpo } = await subir(new Uint8Array(MAX_BYTES_IMAGEN + 1024), 'image/png', 'grande.png');

  assert.equal(http, 422);
  assert.match(cuerpo.error, /5 MB/);
});

// --- Nombre del archivo -------------------------------------------------------

test('el nombre y la extensión los pone el servidor, no el cliente', async () => {
  const antes = readdirSync(directorio);

  // Nombre hostil: ruta relativa y una extensión ejecutable.
  const { http, cuerpo } = await subir(PNG, 'image/png', '../../../evil.php');

  assert.equal(http, 201);
  const nuevos = readdirSync(directorio).filter((f) => !antes.includes(f));
  assert.equal(nuevos.length, 1, 'se escribió fuera del directorio de imágenes');
  assert.ok(!nuevos[0].includes('evil'), 'se respetó el nombre del cliente');
  assert.match(nuevos[0], /^[\w-]+\.png$/, 'la extensión no salió del tipo declarado');
  assert.match(cuerpo.url, /^\/api\/uploads\/imagenes\/[\w-]+\.png$/);
});

test('dos subidas del mismo archivo no se pisan', async () => {
  const primera = await subir(PNG, 'image/png');
  const segunda = await subir(PNG, 'image/png');

  assert.notEqual(primera.cuerpo.url, segunda.cuerpo.url);
});

// --- Encaja con lo que aceptan los esquemas -----------------------------------

test('la URL devuelta es válida como foto_url', async () => {
  const { cuerpo } = await subir(PNG, 'image/png');

  // Si esto falla, se podría subir una imagen y no poder guardarla.
  const r = urlImagenHttpsSchema.safeParse(cuerpo.url);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('foto_url sigue admitiendo una URL https externa y el vacío', () => {
  assert.equal(urlImagenHttpsSchema.safeParse('https://ejemplo.com/foto.jpg').success, true);
  assert.equal(urlImagenHttpsSchema.parse(''), null);
  assert.equal(urlImagenHttpsSchema.parse(null), null);
});

test('foto_url no admite http, texto suelto ni otras carpetas de uploads', () => {
  for (const valor of [
    'http://ejemplo.com/foto.jpg',
    'aprobada',
    '/api/uploads/planes/x.pdf',
    '/api/uploads/imagenes/x.svg',
    'javascript:alert(1)',
  ]) {
    assert.equal(urlImagenHttpsSchema.safeParse(valor).success, false, `admitió "${valor}"`);
  }
});
