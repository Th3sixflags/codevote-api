/**
 * Doble de MySQL en memoria para las pruebas del portal del candidato.
 *
 * No simula un motor SQL: reconoce cada consulta del repositorio por su forma y
 * responde a partir de un estado en memoria (estudiantes, listas, candidatos,
 * asignaciones...). Así las pruebas ejercitan el SQL real que arma cada
 * repositorio y toda la lógica de los servicios, sin necesitar una base.
 *
 * Cualquier consulta no prevista lanza un error, para que un cambio en un
 * repositorio no pase inadvertido.
 */
import type { Pool } from 'mysql2/promise';

export interface Estudiante {
  cedula: string;
  nombres: string;
  apellidos: string;
  correo_institucional?: string;
  rol: 'estudiante' | 'candidato' | 'admin';
  promedio: number;
  id_carrera: number | null;
  estado_academico?: string;
}

export interface Lista {
  id_lista: number;
  nombre_lista: string;
  lema?: string | null;
  estado_revision: string;
  motivo_rechazo?: string | null;
  fk_cedula_responsable: string | null;
  fk_id_votacion: number | null;
  id_proceso: number;
  estado_proceso: string;
  carrera_votacion: number | null;
  nombre_carrera?: string | null;
}

export interface Candidato {
  id_candidato: number;
  cargo: string;
  cumple_requisitos?: number;
  foto_url?: string | null;
  fk_cedula_estudiante: string;
  fk_id_lista: number;
}

export interface Asignacion {
  fk_cedula_estudiante: string;
  fk_id_votacion: number;
  estado: 'activa' | 'retirada';
}

export interface Votacion {
  id_votacion: number;
  titulo_papeleta: string;
  estado: string;
  fk_id_carrera: number | null;
  nombre_carrera?: string | null;
  id_proceso: number;
}

export interface Proceso {
  id_proceso: number;
  nombre_proceso: string;
  estado: string;
  archivado_at?: string | null;
}

export interface Estado {
  estudiantes: Estudiante[];
  listas: Lista[];
  candidatos: Candidato[];
  asignaciones: Asignacion[];
  votaciones: Votacion[];
  procesos: Proceso[];
  planes: any[];
  /** Notificaciones creadas, para comprobar avisos y ausencia de duplicados. */
  notificaciones: Array<{ cedula: string; tipo: string; titulo: string; mensaje: string }>;
  /** Toda sentencia ejecutada, para verificar lo que NO debe ocurrir. */
  sentencias: string[];
  /** Marcas de la transacción: 'BEGIN' | 'COMMIT' | 'ROLLBACK'. */
  transaccion: string[];
  /** Siguiente id que se entregará en un INSERT. */
  proximoId: number;
}

export function estadoVacio(): Estado {
  return {
    estudiantes: [], listas: [], candidatos: [], asignaciones: [],
    votaciones: [], procesos: [], planes: [], notificaciones: [],
    sentencias: [], transaccion: [], proximoId: 100,
  };
}

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/** Fila de `candidato` tal como la devuelve BASE_QUERY del repositorio. */
function filaCandidato(e: Estado, c: Candidato) {
  const est = e.estudiantes.find((x) => x.cedula === c.fk_cedula_estudiante);
  const lista = e.listas.find((l) => l.id_lista === c.fk_id_lista);
  return {
    id_candidato: c.id_candidato,
    cargo: c.cargo,
    cumple_requisitos: c.cumple_requisitos ?? 0,
    foto_url: c.foto_url ?? null,
    fk_cedula_estudiante: c.fk_cedula_estudiante,
    cedula: c.fk_cedula_estudiante,
    nombres: est?.nombres ?? '',
    apellidos: est?.apellidos ?? '',
    nombre_completo: `${est?.nombres ?? ''} ${est?.apellidos ?? ''}`,
    fk_id_lista: c.fk_id_lista,
    nombre_lista: lista?.nombre_lista ?? '',
    es_responsable:
      lista?.fk_cedula_responsable != null
      && lista.fk_cedula_responsable === c.fk_cedula_estudiante ? 1 : 0,
  };
}

/** Fila de `lista_candidata` tal como la devuelve BASE_QUERY del repositorio. */
function filaLista(l: Lista) {
  return {
    id_lista: l.id_lista,
    nombre_lista: l.nombre_lista,
    lema: l.lema ?? null,
    estado_revision: l.estado_revision,
    fecha_inscripcion: '2026-08-01',
    motivo_rechazo: l.motivo_rechazo ?? null,
    fk_cedula_responsable: l.fk_cedula_responsable,
    foto_url: null,
    fk_id_votacion: l.fk_id_votacion,
    id_proceso: l.id_proceso,
    nombre_proceso: `Proceso ${l.id_proceso}`,
    estado_proceso: l.estado_proceso,
    titulo_papeleta: 'Papeleta',
    estado_votacion: 'pendiente',
    carrera_votacion: l.carrera_votacion,
    nombre_carrera: l.nombre_carrera ?? null,
    tiene_votos: 0,
  };
}

/** ¿La candidatura de esa persona sigue activa? (misma regla que el SQL real). */
function candidaturaActivaDe(e: Estado, cedula: string) {
  return e.candidatos.find((c) => {
    if (c.fk_cedula_estudiante !== cedula) return false;
    const l = e.listas.find((x) => x.id_lista === c.fk_id_lista);
    if (!l || ['rechazada', 'retirada'].includes(l.estado_revision)) return false;
    const p = e.procesos.find((x) => x.id_proceso === l.id_proceso);
    return !!p && !['finalizado', 'cancelado'].includes(p.estado) && !p.archivado_at;
  });
}

/**
 * Instala el doble sobre el pool. Devuelve la función para restaurarlo.
 * `extra` permite a cada prueba añadir consultas propias sin tocar el router.
 */
export function instalarDoble(
  pool: Pool,
  e: Estado,
  extra?: (sql: string, params: any[]) => any[] | undefined
) {
  const queryOriginal = (pool as any).query;
  const getConnectionOriginal = (pool as any).getConnection;

  // Devuelve filas (SELECT) o el ResultSetHeader que simula mysql2 (INSERT/DELETE).
  const ejecutar = (sqlCrudo: string, params: any[] = []): any => {
    const sql = norm(sqlCrudo);
    e.sentencias.push(sql);

    const propio = extra?.(sql, params);
    if (propio) return propio;

    // --- asignacion_candidatura -------------------------------------------
    if (sql.includes('FROM asignacion_candidatura a')) {
      const soloActivas = sql.includes("a.estado = 'activa'");
      const asig = e.asignaciones.find((a) =>
        a.fk_cedula_estudiante === params[0] && (!soloActivas || a.estado === 'activa'));
      if (!asig) return [];
      const v = e.votaciones.find((x) => x.id_votacion === asig.fk_id_votacion)!;
      const est = e.estudiantes.find((x) => x.cedula === asig.fk_cedula_estudiante);
      return [{
        id_asignacion: 1,
        fk_cedula_estudiante: asig.fk_cedula_estudiante,
        fk_id_votacion: asig.fk_id_votacion,
        estado: asig.estado,
        titulo_papeleta: v?.titulo_papeleta,
        estado_votacion: v?.estado,
        carrera_votacion: v?.fk_id_carrera ?? null,
        nombre_carrera: v?.nombre_carrera ?? null,
        id_proceso: v?.id_proceso,
        nombre_proceso: `Proceso ${v?.id_proceso}`,
        estado_proceso: e.procesos.find((p) => p.id_proceso === v?.id_proceso)?.estado,
        nombres: est?.nombres, apellidos: est?.apellidos, rol: est?.rol,
      }];
    }
    if (sql.startsWith('INSERT INTO asignacion_candidatura')) {
      const [cedula, votacionId] = params;
      const existente = e.asignaciones.find((a) => a.fk_cedula_estudiante === cedula);
      if (existente) { existente.fk_id_votacion = votacionId; existente.estado = 'activa'; }
      else e.asignaciones.push({ fk_cedula_estudiante: cedula, fk_id_votacion: votacionId, estado: 'activa' });
      return [];
    }
    if (sql.startsWith('DELETE FROM asignacion_candidatura')) {
      const antes = e.asignaciones.length;
      e.asignaciones = e.asignaciones.filter((a) => a.fk_cedula_estudiante !== params[0]);
      return { affectedRows: antes - e.asignaciones.length };
    }

    // --- votacion ----------------------------------------------------------
    if (sql.includes('FROM votacion v') && sql.includes('v.id_votacion = ?')) {
      const v = e.votaciones.find((x) => x.id_votacion === Number(params[0]));
      return v ? [{ ...v, tiene_votos: 0, tiene_comprobantes: 0, tiene_actas: 0, tiene_veedurias: 0 }] : [];
    }

    // --- proceso_electoral -------------------------------------------------
    if (sql.includes('FROM proceso_electoral p') && sql.includes('p.id_proceso = ?')) {
      const p = e.procesos.find((x) => x.id_proceso === Number(params[0]));
      return p ? [{ ...p, archivado_at: p.archivado_at ?? null, tiene_votos: 0, tiene_comprobantes: 0, tiene_actas: 0, tiene_veedurias: 0 }] : [];
    }

    // --- lista_candidata ---------------------------------------------------
    if (sql.startsWith('SELECT 1 FROM lista_candidata') && sql.includes('fk_id_proceso = ?')) {
      return e.listas.filter((l) => l.fk_cedula_responsable === params[0] && l.id_proceso === Number(params[1]));
    }
    if (sql.includes('FROM lista_candidata l') && sql.includes('l.id_lista = ?') && sql.includes('nombre_lista')
        && !sql.includes('FROM candidato c')) {
      const l = e.listas.find((x) => x.id_lista === Number(params[0]));
      return l ? [filaLista(l)] : [];
    }
    if (sql.includes('FROM lista_candidata l') && sql.includes('l.fk_cedula_responsable = ?')
        && !sql.includes('FROM candidato c')) {
      const l = e.listas.find((x) => x.fk_cedula_responsable === params[0]);
      return l ? [filaLista(l)] : [];
    }
    if (sql.startsWith('INSERT INTO lista_candidata')) {
      const [procesoId, votacionId, nombre, lema, estado, cedulaResp] = params;
      const v = e.votaciones.find((x) => x.id_votacion === Number(votacionId));
      const id = e.proximoId += 1;
      e.listas.push({
        id_lista: id, nombre_lista: nombre, lema, estado_revision: estado,
        fk_cedula_responsable: cedulaResp, fk_id_votacion: Number(votacionId),
        id_proceso: Number(procesoId),
        estado_proceso: e.procesos.find((p) => p.id_proceso === Number(procesoId))?.estado ?? 'inscripcion',
        carrera_votacion: v?.fk_id_carrera ?? null, nombre_carrera: v?.nombre_carrera ?? null,
      });
      return { insertId: id };
    }
    if (sql.startsWith('UPDATE lista_candidata SET fk_cedula_responsable')) {
      const l = e.listas.find((x) => x.id_lista === Number(params[1]));
      if (l) l.fk_cedula_responsable = params[0];
      return [];
    }
    if (sql.startsWith('UPDATE lista_candidata SET estado_revision')) {
      const l = e.listas.find((x) => x.id_lista === Number(params[2]));
      if (l) {
        l.estado_revision = params[0];
        l.motivo_rechazo = params[1] ?? null;
      }
      return [];
    }

    // --- notificacion ------------------------------------------------------
    if (sql.startsWith('INSERT INTO notificacion')) {
      const [cedula, tipo, titulo, mensaje] = params;
      e.notificaciones.push({ cedula, tipo, titulo, mensaje });
      return { insertId: (e.proximoId += 1) };
    }

    // --- candidato ---------------------------------------------------------
    // Candidato con datos de su lista (verificación de dueño y estados).
    if (sql.startsWith('SELECT c.id_candidato, c.cargo, c.fk_cedula_estudiante')) {
      const c = e.candidatos.find((x) => x.id_candidato === Number(params[0]));
      if (!c) return [];
      const l = e.listas.find((x) => x.id_lista === c.fk_id_lista)!;
      return [{
        id_candidato: c.id_candidato, cargo: c.cargo,
        fk_cedula_estudiante: c.fk_cedula_estudiante, fk_id_lista: c.fk_id_lista,
        fk_cedula_responsable: l.fk_cedula_responsable,
        estado_revision: l.estado_revision, fk_id_proceso: l.id_proceso,
        estado_proceso: l.estado_proceso,
        es_responsable: l.fk_cedula_responsable === c.fk_cedula_estudiante ? 1 : 0,
      }];
    }
    if (sql.includes('FROM candidato c') && sql.includes('c.fk_id_lista = ?') && sql.includes('cumple_requisitos')) {
      return e.candidatos
        .filter((c) => c.fk_id_lista === Number(params[0]))
        .sort((a, b) => Number(b.cargo === 'Presidente') - Number(a.cargo === 'Presidente'))
        .map((c) => filaCandidato(e, c));
    }
    if (sql.includes('FROM candidato c') && sql.includes('c.id_candidato = ?') && sql.includes('cumple_requisitos')) {
      const c = e.candidatos.find((x) => x.id_candidato === Number(params[0]));
      return c ? [filaCandidato(e, c)] : [];
    }
    if (sql.startsWith('SELECT 1 FROM candidato WHERE fk_id_lista = ? AND cargo = ?')) {
      return e.candidatos.filter((c) =>
        c.fk_id_lista === Number(params[0]) && c.cargo === params[1] && c.id_candidato !== Number(params[2]));
    }
    if (sql.startsWith('SELECT 1 FROM candidato WHERE fk_cedula_estudiante = ? AND fk_id_lista = ?')) {
      return e.candidatos.filter((c) =>
        c.fk_cedula_estudiante === params[0] && c.fk_id_lista === Number(params[1]));
    }
    // participaEnProceso
    if (sql.startsWith('SELECT 1 FROM candidato c') && sql.includes('l.fk_id_proceso = ?')) {
      return e.candidatos.filter((c) => {
        const l = e.listas.find((x) => x.id_lista === c.fk_id_lista);
        return c.fk_cedula_estudiante === params[0]
          && l?.id_proceso === Number(params[1])
          && c.id_candidato !== Number(params[2]);
      });
    }
    // candidaturaActiva
    if (sql.includes('FROM candidato c') && sql.includes("l.estado_revision NOT IN")) {
      const c = candidaturaActivaDe(e, params[0]);
      if (!c || c.id_candidato === Number(params[1])) return [];
      const l = e.listas.find((x) => x.id_lista === c.fk_id_lista)!;
      const p = e.procesos.find((x) => x.id_proceso === l.id_proceso)!;
      return [{
        id_candidato: c.id_candidato, id_lista: l.id_lista, nombre_lista: l.nombre_lista,
        id_proceso: p.id_proceso, nombre_proceso: p.nombre_proceso, tipo_proceso: 'consejo',
      }];
    }
    // Integrantes de la lista con su cargo: lo que lee la transferencia de
    // responsable para intercambiar los cargos.
    if (sql.startsWith('SELECT id_candidato, cargo, fk_cedula_estudiante FROM candidato WHERE fk_id_lista = ?')) {
      return e.candidatos.filter((c) => c.fk_id_lista === Number(params[0]));
    }
    if (sql.startsWith('SELECT id_candidato FROM candidato WHERE fk_id_lista = ?')) {
      return e.candidatos.filter((c) =>
        c.fk_id_lista === Number(params[0]) && c.fk_cedula_estudiante === params[1]);
    }
    if (sql.startsWith('INSERT INTO candidato')) {
      const [cargo, ...resto] = params;
      // Dos formas de INSERT: la del portal (5 params) y la interna (3).
      const cedula = resto.length === 4 ? resto[2] : resto[0];
      const listaId = resto.length === 4 ? resto[3] : resto[1];
      const id = e.proximoId += 1;
      if (cargo === 'Presidente'
          && e.candidatos.some((c) => c.fk_id_lista === Number(listaId) && c.cargo === 'Presidente')) {
        const err: any = new Error('Duplicate entry');
        err.code = 'ER_DUP_ENTRY'; err.errno = 1062;
        throw err;
      }
      e.candidatos.push({
        id_candidato: id, cargo, fk_cedula_estudiante: cedula,
        fk_id_lista: Number(listaId), cumple_requisitos: 0, foto_url: null,
      });
      return { insertId: id };
    }
    if (sql.startsWith('UPDATE candidato SET') && sql.includes('id_candidato = ?')) {
      const c = e.candidatos.find((x) => x.id_candidato === Number(params[params.length - 1]));
      if (c && sql.includes('cargo = ?')) c.cargo = params[0];
      return [];
    }
    if (sql.startsWith('DELETE FROM candidato')) {
      const antes = e.candidatos.length;
      e.candidatos = e.candidatos.filter((c) => c.id_candidato !== Number(params[0]));
      return { affectedRows: antes - e.candidatos.length };
    }

    // --- estudiante --------------------------------------------------------
    if (sql.includes('FROM estudiante e') && sql.includes('e.cedula = ?') && sql.includes('correo_institucional')) {
      const est = e.estudiantes.find((x) => x.cedula === params[0]);
      return est ? [{ ...est, estado_academico: est.estado_academico ?? 'activo', asig_votacion: null }] : [];
    }
    if (sql.includes('e.fk_id_carrera') && sql.includes('FROM estudiante') && sql.includes('cedula = ?')) {
      const est = e.estudiantes.find((x) => x.cedula === params[0]);
      return [{ fk_id_carrera: est?.id_carrera ?? null }];
    }
    if (sql.startsWith('UPDATE estudiante')) {
      // El rol nuevo se lee del SET, no del WHERE (que también nombra el rol).
      const asciende = /SET (e\.)?rol = 'candidato'/.test(sql);
      const est = e.estudiantes.find((x) => x.cedula === params[params.length - 1]);
      if (est && est.rol !== 'admin') {
        // Al degradar se respeta el NOT EXISTS: sigue siendo 'candidato' si
        // todavía es responsable de alguna lista.
        const responsableDeAlguna = e.listas.some((l) => l.fk_cedula_responsable === est.cedula);
        if (asciende) est.rol = 'candidato';
        else if (!responsableDeAlguna) est.rol = 'estudiante';
      }
      return [];
    }

    // --- plan_trabajo ------------------------------------------------------
    if (sql.includes('FROM plan_trabajo')) {
      return e.planes.filter((p) => p.fk_id_lista === Number(params[0]));
    }

    throw new Error(`consulta inesperada en la prueba: ${sql.slice(0, 160)}`);
  };

  (pool as any).query = async (sql: string, params: any[] = []) => [ejecutar(sql, params), []];

  // Conexión con transacción: comparte el mismo router y anota begin/commit/rollback.
  (pool as any).getConnection = async () => ({
    query: async (sql: string, params: any[] = []) => [ejecutar(sql, params), []],
    beginTransaction: async () => { e.transaccion.push('BEGIN'); },
    commit:           async () => { e.transaccion.push('COMMIT'); },
    rollback:         async () => { e.transaccion.push('ROLLBACK'); },
    release:          () => {},
  });

  return () => {
    (pool as any).query = queryOriginal;
    (pool as any).getConnection = getConnectionOriginal;
  };
}
