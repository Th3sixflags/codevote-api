import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host:               process.env.DB_HOST     ?? 'localhost',
  port:               Number(process.env.DB_PORT ?? 3306),
  user:               process.env.DB_USER     ?? 'root',
  password:           process.env.DB_PASSWORD ?? '',
  database:           process.env.DB_NAME     ?? 'codevote_db',
  // Necesario para que tildes y ñ se lean/escriban correctamente
  charset:            'utf8mb4',
  /**
   * Las columnas DATETIME se leen como TEXTO ('YYYY-MM-DD HH:mm:ss'), no como
   * objetos Date.
   *
   * Por defecto mysql2 construye un Date interpretando el literal en la zona
   * horaria del PROCESO. En Docker el proceso corre en UTC, así que una votación
   * que cierra a las 18:00 (hora de Ecuador) se convertía en un instante que
   * representaba las 18:00 UTC, es decir las 13:00 de Ecuador: cinco horas de
   * desfase en cada comparación y en cada fecha mostrada.
   *
   * Un DATETIME no lleva zona horaria; en este esquema son hora de Ecuador por
   * convención (ver db/schema.sql). Leerlos como texto conserva esa convención
   * intacta y permite compararlos contra `ahoraEnEcuador()`, que produce el
   * mismo formato, sin que intervenga ninguna conversión.
   */
  dateStrings:        true,
  waitForConnections: true,
  connectionLimit:    10,
});

pool.on('connection', (connection) => {
  connection.query('SET NAMES utf8mb4');
});
