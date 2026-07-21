import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host:               process.env.DB_HOST     ?? 'localhost',
  port:               Number(process.env.DB_PORT ?? 3306),
  user:               process.env.DB_USER     ?? 'root',
  password:           process.env.DB_PASSWORD ?? '',
  database:           process.env.DB_NAME     ?? 'codevote_db',
  // Necesario para que tildes y ñ se lean/escriban correctamente
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
});
