/**
 * Archivado de un proceso y liberación de sus candidaturas.
 *
 * Archivar NO borra nada: papeletas, listas, integrantes, propuestas, votos,
 * comprobantes y actas quedan como historial. Lo que termina es la candidatura:
 * las asignaciones del proceso se retiran y quien lo presidía recupera su rol
 * de estudiante, de modo que pueda postularse otra vez más adelante.
 *
 * El ciclo completo se comprobó además contra MySQL real (transacciones,
 * claves foráneas y la restricción única de asignacion_candidatura); aquí se
 * fija el comportamiento para que no se pierda.
 */
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { pool } from '../src/config/database.js';
import {
  responsablesDelProceso, retirarAsignacionesDelProceso,
  degradarResponsablesLiberados, archivarYLiberar,
} from '../src/repositories/archivado.repository.js';

interface Lista { id_lista: number; fk_id_proceso: number; fk_cedula_responsable: string | null }
interface Asignacion { cedula: string; votacion: number; estado: string }

let procesos: Array<{ id: number; archivado: boolean }>;
let listas: Lista[];
let asignaciones: Asignacion[];
let roles: Record<string, string>;
/** Papeleta -> proceso, para resolver los JOIN del doble. */
const PAPELETA_DE_PROCESO: Record<number, number> = { 1: 1, 2: 1, 9: 9 };

const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;

function ejecutar(sqlCrudo: string, params: any[] = []): any {
  const sql = sqlCrudo.replace(/\s+/g, ' ').trim();

  if (sql.startsWith('SELECT DISTINCT fk_cedula_responsable')) {
    const procesoId = Number(params[0]);
    const cedulas = listas
      .filter((l) => l.fk_id_proceso === procesoId && l.fk_cedula_responsable)
      .map((l) => l.fk_cedula_responsable!);
    return [...new Set(cedulas)].map((cedula) => ({ cedula }));
  }

  if (sql.startsWith('UPDATE proceso_electoral SET archivado_at')) {
    const p = procesos.find((x) => x.id === Number(params[0]));
    if (!p || p.archivado) return { affectedRows: 0 };
    p.archivado = true;
    return { affectedRows: 1 };
  }

  if (sql.startsWith('UPDATE asignacion_candidatura a')) {
    const procesoId = Number(params[0]);
    const afectadas = asignaciones.filter(
      (a) => PAPELETA_DE_PROCESO[a.votacion] === procesoId && a.estado === 'activa');
    afectadas.forEach((a) => { a.estado = 'retirada'; });
    return { affectedRows: afectadas.length };
  }

  if (sql.startsWith('UPDATE estudiante e SET e.rol =')) {
    const degradadas = params.filter((cedula: string) =>
      roles[cedula] === 'candidato'
      // No dirige ninguna lista de un proceso sin archivar…
      && !listas.some((l) => l.fk_cedula_responsable === cedula
          && !procesos.find((p) => p.id === l.fk_id_proceso)?.archivado)
      // …ni conserva una asignación activa.
      && !asignaciones.some((a) => a.cedula === cedula && a.estado === 'activa'));
    degradadas.forEach((c: string) => { roles[c] = 'estudiante'; });
    return { affectedRows: degradadas.length };
  }

  if (sql.startsWith('SELECT cedula FROM estudiante')) {
    return params.filter((c: string) => roles[c] === 'estudiante').map((cedula: string) => ({ cedula }));
  }

  throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 140)}`);
}

beforeEach(() => {
  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];
  (pool as any).getConnection = async () => ({
    query: async (sql: string, params: any[] = []) => [ejecutar(sql, params), []],
    beginTransaction: async () => {}, commit: async () => {},
    rollback: async () => {}, release: () => {},
  });

  procesos = [{ id: 1, archivado: false }, { id: 9, archivado: false }];
  listas = [
    { id_lista: 1, fk_id_proceso: 1, fk_cedula_responsable: '1710000017' },
    { id_lista: 2, fk_id_proceso: 1, fk_cedula_responsable: '1710000058' },
    { id_lista: 3, fk_id_proceso: 1, fk_cedula_responsable: null },
  ];
  asignaciones = [
    { cedula: '1710000017', votacion: 1, estado: 'activa' },
    { cedula: '1710000058', votacion: 1, estado: 'activa' },
  ];
  roles = { '1710000017': 'candidato', '1710000058': 'candidato', '1710000009': 'admin' };
});

after(async () => {
  (pool as any).query = queryOriginal;
  (pool as any).getConnection = getConnectionOriginal;
  await pool.end();
});

// --- Archivado --------------------------------------------------------------

test('archivar retira las asignaciones y devuelve a estudiante a los presidentes', async () => {
  const r = await archivarYLiberar(1);

  assert.equal(r.yaEstabaArchivado, false);
  assert.equal(r.asignacionesRetiradas, 2);
  assert.deepEqual(r.responsablesLiberados.sort(), ['1710000017', '1710000058']);
  assert.equal(roles['1710000017'], 'estudiante');
  assert.equal(roles['1710000058'], 'estudiante');
  assert.deepEqual(asignaciones.map((a) => a.estado), ['retirada', 'retirada']);
});

test('archivar no toca las listas: siguen ahí como historial', async () => {
  const antes = JSON.parse(JSON.stringify(listas));
  await archivarYLiberar(1);
  assert.deepEqual(listas, antes, 'el archivado no debe alterar ninguna lista');
});

test('una lista sin responsable no estorba', async () => {
  const r = await archivarYLiberar(1);
  assert.equal(r.responsablesLiberados.length, 2, 'solo se libera a quienes existen');
});

test('quien preside otra candidatura vigente conserva el rol', async () => {
  // 1710000017 también dirige una lista del proceso 9, que sigue activo.
  listas.push({ id_lista: 4, fk_id_proceso: 9, fk_cedula_responsable: '1710000017' });

  await archivarYLiberar(1);

  assert.equal(roles['1710000017'], 'candidato', 'sigue dirigiendo el proceso 9');
  assert.equal(roles['1710000058'], 'estudiante');
});

test('quien conserva una asignación activa en otra papeleta no se degrada', async () => {
  asignaciones.push({ cedula: '1710000058', votacion: 9, estado: 'activa' });

  await archivarYLiberar(1);

  assert.equal(roles['1710000058'], 'candidato', 'su asignación al proceso 9 sigue activa');
});

test('un admin nunca se degrada al archivar', async () => {
  listas.push({ id_lista: 5, fk_id_proceso: 1, fk_cedula_responsable: '1710000009' });

  await archivarYLiberar(1);

  assert.equal(roles['1710000009'], 'admin');
});

// --- Idempotencia -----------------------------------------------------------

test('archivar dos veces no duplica acciones ni falla', async () => {
  await archivarYLiberar(1);
  const rolesTrasLaPrimera = { ...roles };

  const segunda = await archivarYLiberar(1);

  assert.equal(segunda.yaEstabaArchivado, true, 'avisa de que ya estaba archivado');
  assert.equal(segunda.asignacionesRetiradas, 0, 'no hay asignaciones nuevas que retirar');
  assert.deepEqual(roles, rolesTrasLaPrimera, 'los roles no cambian en la segunda pasada');
});

test('una reasignación posterior sobrevive a un segundo archivado', async () => {
  await archivarYLiberar(1);
  // La persona vuelve a ser candidata en otro proceso.
  asignaciones.push({ cedula: '1710000017', votacion: 9, estado: 'activa' });
  roles['1710000017'] = 'candidato';

  await archivarYLiberar(1);

  assert.equal(roles['1710000017'], 'candidato', 'su nueva candidatura no debe verse afectada');
  assert.equal(asignaciones.find((a) => a.votacion === 9)?.estado, 'activa');
});

// --- Piezas por separado ----------------------------------------------------

test('responsablesDelProceso no repite ni incluye nulos', async () => {
  listas.push({ id_lista: 6, fk_id_proceso: 1, fk_cedula_responsable: '1710000017' });
  const cedulas = await responsablesDelProceso(1);
  assert.deepEqual(cedulas.sort(), ['1710000017', '1710000058']);
});

test('retirarAsignacionesDelProceso solo toca las activas de ese proceso', async () => {
  asignaciones.push({ cedula: '1710000033', votacion: 9, estado: 'activa' });

  const retiradas = await retirarAsignacionesDelProceso(1);

  assert.equal(retiradas, 2);
  assert.equal(asignaciones.find((a) => a.cedula === '1710000033')?.estado, 'activa',
    'la asignación de otro proceso no se toca');
});

test('degradar sin cédulas no consulta nada', async () => {
  const liberados = await degradarResponsablesLiberados([]);
  assert.deepEqual(liberados, []);
});
