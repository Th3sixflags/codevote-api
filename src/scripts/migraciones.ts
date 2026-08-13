/** Ledger de migraciones: registra únicamente SQL ya aplicado por el operador. */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/database.js';
import { resolverBaseline } from '../utils/migracionesBaseline.js';

const directorio = path.join(process.cwd(), 'db', 'migrations');

async function archivos() {
  return (await readdir(directorio)).filter((nombre) => nombre.endsWith('.sql')).sort();
}

async function checksum(nombre: string) {
  return createHash('sha256').update(await readFile(path.join(directorio, nombre))).digest('hex');
}

async function asegurarLedger() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre_archivo VARCHAR(255) NOT NULL PRIMARY KEY,
    sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    aplicada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aplicada_por VARCHAR(100) NULL,
    INDEX idx_schema_migrations_aplicada_at (aplicada_at)
  ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

async function estado() {
  await asegurarLedger();
  const [aplicadas] = await pool.query('SELECT nombre_archivo, sha256, aplicada_at FROM schema_migrations ORDER BY nombre_archivo') as [Array<any>, unknown];
  const porNombre = new Map(aplicadas.map((fila) => [fila.nombre_archivo, fila]));
  const archivosRepositorio = await archivos();
  for (const nombre of archivosRepositorio) {
    const fila = porNombre.get(nombre);
    const estadoActual = !fila ? 'PENDIENTE' : fila.sha256 === await checksum(nombre) ? 'APLICADA' : 'CHECKSUM_DISTINTO';
    console.log(`${estadoActual}\t${nombre}${fila?.aplicada_at ? `\t${fila.aplicada_at}` : ''}`);
  }
  const desconocidas = aplicadas.filter((fila) => !archivosRepositorio.includes(fila.nombre_archivo));
  for (const fila of desconocidas) console.log(`NO_EN_REPOSITORIO\t${fila.nombre_archivo}\t${fila.aplicada_at}`);
}

async function registrar(nombre: string) {
  if (!(await archivos()).includes(nombre)) throw new Error(`No existe db/migrations/${nombre}`);
  await asegurarLedger();
  const sha256 = await checksum(nombre);
  const operador = process.env.MIGRATIONS_OPERATOR?.slice(0, 100) || null;
  const [existente] = await pool.query('SELECT sha256 FROM schema_migrations WHERE nombre_archivo = ?', [nombre]) as [Array<{ sha256: string }>, unknown];
  if (existente[0] && existente[0].sha256 !== sha256) throw new Error(`El checksum registrado para ${nombre} no coincide; detener y revisar.`);
  await pool.query('INSERT IGNORE INTO schema_migrations (nombre_archivo, sha256, aplicada_por) VALUES (?, ?, ?)', [nombre, sha256, operador]);
  console.log(`Registrada: ${nombre}`);
}

async function reconciliar(args: string[]) {
  const nombres = resolverBaseline(args, process.env.MIGRATIONS_OPERATOR);
  const disponibles = await archivos();
  for (const nombre of nombres) {
    if (!disponibles.includes(nombre)) throw new Error(`Falta db/migrations/${nombre}; no se puede reconciliar el baseline.`);
    await registrar(nombre);
  }
  console.log(`Baseline reconciliado: ${nombres.length} migraciones históricas registradas; no se ejecutó SQL.`);
}

const [accion, ...argumentos] = process.argv.slice(2);
try {
  if (accion === 'estado') await estado();
  else if (accion === 'registrar' && argumentos.length === 1) await registrar(argumentos[0]);
  else if (accion === 'reconciliar') await reconciliar(argumentos);
  else throw new Error('Uso: npm run migraciones:estado | npm run migraciones:registrar -- <archivo.sql> | npm run migraciones:reconciliar -- --confirmar-base-existente --todas-historicas');
} finally {
  await pool.end();
}
