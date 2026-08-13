/**
 * Migraciones que existían antes de introducir schema_migrations. Esta lista
 * cerrada impide que un archivo nuevo se marque por accidente como histórico.
 */
export const MIGRACIONES_HISTORICAS = [
  '2026-07-29_cambio_password_obligatorio.sql',
  '2026-07-29_cedulas_validas.sql',
  '2026-07-29_codigo_verificacion.sql',
  '2026-07-29_foto_lista_candidata.sql',
  '2026-07-29_foto_perfil.sql',
  '2026-07-29_portal_candidato.sql',
  '2026-07-29_promedios_a_100.sql',
  '2026-07-30_asignacion_candidatura.sql',
  '2026-07-30_carrera_por_votacion.sql',
  '2026-07-30_foto_proceso_votacion.sql',
  '2026-07-30_procesos_por_carrera.sql',
  '2026-08-01_responsable_presidente.sql',
  '2026-08-03_uq_codigo_votante.sql',
  '2026-08-04_login_otp.sql',
  '2026-08-04_recordatorios_y_sanciones.sql',
  '2026-08-12_aislamiento_institucional.sql',
  '2026-08-12_p1_sesiones_auditoria_hash_actas.sql',
  '2026-08-12_unificar_collation_rutas_archivos.sql',
  '2026-08-13_sesiones_cookie_rotacion.sql',
] as const;

/** Solo acepta una confirmación explícita: nunca se reconcilia por defecto. */
export function resolverBaseline(args: string[], operador?: string) {
  if (args.length !== 2 || args[0] !== '--confirmar-base-existente' || args[1] !== '--todas-historicas') {
    throw new Error('Uso seguro: MIGRATIONS_OPERATOR=nombre npm run migraciones:reconciliar -- --confirmar-base-existente --todas-historicas');
  }
  if (!operador?.trim()) throw new Error('MIGRATIONS_OPERATOR es obligatorio para reconciliar un baseline.');
  return [...MIGRACIONES_HISTORICAS];
}
