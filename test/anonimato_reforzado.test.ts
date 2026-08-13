/** Contratos negativos: ningún endpoint electoral devuelve identidad o elección. */
process.env.JWT_SECRET = 'secreto-anonimato';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database.js';
import votoRoutes from '../src/routes/voto.routes.js';
import codigoVotoRoutes from '../src/routes/codigo_voto.routes.js';
import verificacionPublicaRoutes from '../src/routes/verificacion_publica.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const prohibidos = ['cedula', 'nombres', 'apellidos', 'correo', 'lista', 'candidato', 'tipo_voto', 'fk_id_lista', 'id_voto', 'codigo_hash'];
const token = jwt.sign({ sub: '1105946139', email: 'ana@uide.edu.ec', rol: 'estudiante', fk_id_institucion: 1 }, process.env.JWT_SECRET!);
const queryOriginal = (pool as any).query;
const getConnectionOriginal = (pool as any).getConnection;
const app = express();
app.use(express.json());
app.use('/api/votos', votoRoutes);
app.use('/api/codigos-voto', codigoVotoRoutes);
app.use('/api/verificar-voto', verificacionPublicaRoutes);
app.use(errorHandler);
let servidor: ReturnType<typeof app.listen>; let baseUrl = '';

function fila() { return [{ votacion: 'abierta', proceso: 'votacion', carrera_votacion: null, archivado: 0, fecha_apertura: '2026-01-01 00:00:00', fecha_cierre: '2099-12-31 23:59:59', fecha_fin_votacion: '2099-12-31 23:59:59', fk_id_institucion: 1 }]; }
async function consulta(sql: string, params: any[] = []) {
  if (sql.includes('FROM votacion v') && sql.includes('p.estado AS proceso')) return fila();
  if (sql.includes('FROM estudiante') && sql.includes('FOR UPDATE')) return [{ cedula: params[0], rol: 'estudiante', estado_academico: 'activo', fk_id_carrera: null, fk_id_institucion: 1 }];
  if (sql.startsWith('SELECT 1 FROM codigo_voto')) return [];
  if (sql.startsWith('INSERT INTO voto') || sql.startsWith('INSERT INTO codigo_voto') || sql.startsWith('INSERT INTO notificacion')) return { insertId: 1 };
  if (sql.includes('WHERE cv.id_codigo = ? AND cv.fk_cedula_estudiante = ?')) return [{ codigo_verificacion: '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f', estado_codigo: 'usado', fecha_envio: '2026-08-13 10:00:00', titulo_papeleta: 'Papeleta', nombre_proceso: 'Proceso' }];
  if (sql.includes('FROM codigo_voto cv') && sql.includes('WHERE cv.fk_cedula_estudiante')) return [{ fk_id_votacion: 8, titulo_papeleta: 'Papeleta', nombre_proceso: 'Proceso', estado_codigo: 'usado', fecha_envio: '2026-08-13 10:00:00', codigo_verificacion: '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f', fk_cedula_estudiante: '1105946139' }];
  if (sql.includes('WHERE cv.codigo_verificacion')) return [{ nombre_proceso: 'Proceso', titulo_papeleta: 'Papeleta', fecha_envio: '2026-08-13 10:00:00' }];
  if (sql.includes('FROM notificacion')) return [];
  throw new Error(`consulta inesperada: ${sql.slice(0, 100)}`);
}
before(async () => { (pool as any).query = async (s: string, p: any[] = []) => [await consulta(s, p), []]; (pool as any).getConnection = async () => ({ query: async (s: string, p: any[] = []) => [await consulta(s, p), []], beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} }); await new Promise<void>(r => { servidor = app.listen(0, () => { baseUrl = `http://127.0.0.1:${(servidor.address() as any).port}`; r(); }); }); });
after(async () => { (pool as any).query = queryOriginal; (pool as any).getConnection = getConnectionOriginal; await new Promise<void>(r => servidor.close(() => r())); await pool.end(); });

function sinSecretos(cuerpo: unknown) { const json = JSON.stringify(cuerpo).toLowerCase(); for (const campo of prohibidos) assert.ok(!json.includes(campo), `expone ${campo}`); }
test('emitir voto solo confirma participación con código opaco', async () => { const r = await fetch(`${baseUrl}/api/votos`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fk_id_votacion: 8, tipo_voto: 'blanco', fk_id_lista: null }) }); const cuerpo = await r.json(); assert.equal(r.status, 201); assert.deepEqual(Object.keys(cuerpo).sort(), ['codigo_verificacion', 'registrado']); sinSecretos(cuerpo); });
test('comprobantes y verificaciones omiten identidad y elección', async () => {
  const propios = await (await fetch(`${baseUrl}/api/codigos-voto/mis-codigos`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const propio = await (await fetch(`${baseUrl}/api/codigos-voto/mis-codigos/1/verificar`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const publico = await (await fetch(`${baseUrl}/api/verificar-voto/6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f`)).json();

  sinSecretos(propios);
  sinSecretos(propio);
  sinSecretos(publico);
});
