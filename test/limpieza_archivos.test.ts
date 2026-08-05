/**
 * Limpieza de archivos subidos que nadie referencia.
 *
 * Hace falta porque la imagen se sube al ELEGIRLA, no al guardar el formulario:
 * cancelar un formulario, o cambiar de foto tres veces antes de guardar, deja
 * archivos en disco que no apunta nadie. En un servidor pequeño ese goteo acaba
 * llenando el disco, y un disco lleno tumba MySQL en plena votación.
 *
 * Como esta función BORRA, las pruebas se centran en que no borre de más:
 *   - nunca toca un archivo referenciado;
 *   - nunca toca uno reciente (puede estar en un formulario sin guardar);
 *   - sí borra los huérfanos antiguos.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import { limpiarArchivosHuerfanos } from '../src/services/limpieza_archivos.service.js';
import { DIRECTORIO_UPLOADS, SUBRUTA_IMAGENES } from '../src/config/uploads.js';

const directorio = path.join(DIRECTORIO_UPLOADS, SUBRUTA_IMAGENES);
const queryOriginal = (pool as any).query;

/** Nombres que la base dirá que están en uso. */
let enUso: string[] = [];
const creados: string[] = [];

/** Crea un archivo con la antigüedad indicada, en horas. */
function crearArchivo(nombre: string, horasDeAntiguedad: number) {
  if (!existsSync(directorio)) mkdirSync(directorio, { recursive: true });
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, 'contenido de prueba');
  const momento = new Date(Date.now() - horasDeAntiguedad * 60 * 60 * 1000);
  utimesSync(ruta, momento, momento);
  creados.push(nombre);
  return ruta;
}

const existe = (nombre: string) => existsSync(path.join(directorio, nombre));

before(() => {
  (pool as any).query = async () => [enUso.map((ruta) => ({ ruta })), []];
});

after(async () => {
  (pool as any).query = queryOriginal;
  await pool.end();
  const { rmSync } = await import('node:fs');
  for (const nombre of creados) rmSync(path.join(directorio, nombre), { force: true });
});

beforeEach(() => { enUso = []; });

test('borra un huérfano antiguo', async () => {
  crearArchivo('prueba-huerfano-viejo.png', 48);

  const resultado = await limpiarArchivosHuerfanos();

  assert.ok(resultado.borrados >= 1);
  assert.equal(existe('prueba-huerfano-viejo.png'), false);
});

test('NO borra un archivo referenciado, por antiguo que sea', async () => {
  crearArchivo('prueba-en-uso.png', 24 * 365);
  enUso = ['/api/uploads/imagenes/prueba-en-uso.png'];

  await limpiarArchivosHuerfanos();

  assert.equal(existe('prueba-en-uso.png'), true, 'borró una imagen que está en uso');
});

test('NO borra un archivo reciente aunque nadie lo referencie', async () => {
  // Puede estar en un formulario abierto sin guardar todavía: borrarlo dejaría
  // la foto rota justo al pulsar "Guardar".
  crearArchivo('prueba-recien-subida.png', 1);

  await limpiarArchivosHuerfanos();

  assert.equal(existe('prueba-recien-subida.png'), true, 'borró una imagen recién subida');
});

test('justo en el límite de las 24 h todavía no se borra', async () => {
  crearArchivo('prueba-limite.png', 23.5);

  await limpiarArchivosHuerfanos();

  assert.equal(existe('prueba-limite.png'), true);
});

test('reconoce el archivo en uso por su nombre, con o sin dominio delante', async () => {
  crearArchivo('prueba-absoluta.png', 48);
  enUso = ['https://codevote.lat/api/uploads/imagenes/prueba-absoluta.png'];

  await limpiarArchivosHuerfanos();

  assert.equal(existe('prueba-absoluta.png'), true, 'no reconoció una URL absoluta');
});

test('informa de cuántos revisó, borró y cuánto liberó', async () => {
  crearArchivo('prueba-metricas.png', 48);

  const resultado = await limpiarArchivosHuerfanos();

  assert.ok(resultado.revisados >= 1);
  assert.ok(resultado.borrados >= 1);
  assert.ok(resultado.bytesLiberados > 0);
});

test('con la base vacía de referencias no revienta ni borra lo reciente', async () => {
  crearArchivo('prueba-sin-referencias.png', 1);
  enUso = [];

  const resultado = await limpiarArchivosHuerfanos();

  assert.ok(resultado.revisados >= 1);
  assert.equal(existe('prueba-sin-referencias.png'), true);
});
