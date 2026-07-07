import { pool } from '../config/database';
import { CrearVotoDTO } from '../schemas/voto.schema';

const BASE_QUERY = `
  SELECT
    v.id_voto, v.tipo_voto, v.fecha_hora,
    vot.id_votacion, vot.titulo_papeleta,
    l.id_lista, l.nombre_lista
  FROM voto v
  JOIN votacion vot ON vot.id_votacion = v.fk_id_votacion
  LEFT JOIN lista_candidata l ON l.id_lista = v.fk_id_lista
`;

export async function findByVotacion(votacionId: number) {
  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.fk_id_votacion = ? ORDER BY v.fecha_hora DESC', [votacionId]);
  return rows as any[];
}

export async function create(data: CrearVotoDTO) {
  const [result] = await pool.query(
    `INSERT INTO voto (fk_id_votacion, tipo_voto, fk_id_lista) VALUES (?, ?, ?)`,
    [data.fk_id_votacion, data.tipo_voto, data.fk_id_lista ?? null]
  ) as [any, any];

  const [rows] = await pool.query(BASE_QUERY + ' WHERE v.id_voto = ?', [result.insertId]) as [any[], any];
  return rows[0];
}

export async function countByVotacion(votacionId: number) {
  const [rows] = await pool.query(
    `SELECT IFNULL(l.nombre_lista, v.tipo_voto) AS opcion, COUNT(*) AS total_votos
     FROM voto v
     LEFT JOIN lista_candidata l ON l.id_lista = v.fk_id_lista
     WHERE v.fk_id_votacion = ?
     GROUP BY l.nombre_lista, v.tipo_voto
     ORDER BY total_votos DESC`,
    [votacionId]
  );
  return rows as any[];
}
