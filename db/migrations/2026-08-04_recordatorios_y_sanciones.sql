-- =============================================================================
-- Migración: recordatorios por correo y sanciones por no votar
-- Fecha: 2026-08-04
-- =============================================================================
-- Tres tablas:
--
--   aviso_papeleta         Qué avisos automáticos ya salieron por cada papeleta.
--                          Es la marca de idempotencia: la tarea corre cada
--                          minuto y sin esto reenviaría la convocatoria una y
--                          otra vez. La clave única (papeleta, tipo) garantiza
--                          que cada aviso sale UNA sola vez, incluso si dos
--                          instancias del servidor pasan a la vez.
--
--   recordatorio_programado  Envíos que la administración programa a mano desde
--                          el panel ("programar recordatorio"), con su fecha y
--                          hora. La misma tarea los despacha cuando llega el
--                          momento.
--
--   sancion_electoral      Registro de quien no votó en una papeleta cerrada.
--                          Se guarda como historial verificable, no solo como
--                          correo enviado. La clave única (papeleta, cédula)
--                          evita duplicarla si el cierre se reprocesa.
--
-- IMPORTANTE (anonimato): la sanción se deduce de `codigo_voto`, que prueba
-- QUIÉN participó pero no QUÉ votó. No se toca la tabla `voto`, que es anónima,
-- así que registrar una sanción no revela ni relaciona el sentido de ningún
-- voto.
--
-- IDEMPOTENTE: re-ejecutarla no altera nada.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-08-04_recordatorios_y_sanciones.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

-- 1. Avisos automáticos ya enviados por papeleta.
CREATE TABLE IF NOT EXISTS aviso_papeleta (
  id_aviso INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_votacion INT NOT NULL,
  -- convocatoria: se creó la papeleta.  apertura: empezó la votación.
  -- cierre_proximo: falta poco para cerrar.  sancion: se cerró y se sancionó.
  tipo ENUM('convocatoria', 'apertura', 'cierre_proximo', 'sancion') NOT NULL,
  enviado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  destinatarios INT NOT NULL DEFAULT 0,
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_aviso_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion) ON DELETE CASCADE,
  CONSTRAINT uq_aviso_papeleta UNIQUE (fk_id_votacion, tipo)
);

-- 2. Recordatorios que programa la administración.
CREATE TABLE IF NOT EXISTS recordatorio_programado (
  id_recordatorio INT AUTO_INCREMENT PRIMARY KEY,
  fk_id_proceso INT NOT NULL,
  -- NULL = a todo el padrón del proceso; con valor = solo al de esa papeleta.
  fk_id_votacion INT NULL DEFAULT NULL,
  asunto VARCHAR(150) NOT NULL,
  mensaje VARCHAR(1000) NOT NULL,
  programado_para DATETIME NOT NULL,
  -- Si es 1, solo se envía a quienes todavía no han votado esa papeleta.
  solo_pendientes TINYINT(1) NOT NULL DEFAULT 1,
  enviado_at DATETIME NULL DEFAULT NULL,
  destinatarios INT NULL DEFAULT NULL,
  error VARCHAR(250) NULL DEFAULT NULL,
  creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fk_cedula_creador CHAR(10) NULL DEFAULT NULL,
  CONSTRAINT fk_recordatorio_proceso FOREIGN KEY (fk_id_proceso) REFERENCES proceso_electoral(id_proceso) ON DELETE CASCADE,
  CONSTRAINT fk_recordatorio_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion) ON DELETE CASCADE,
  INDEX idx_recordatorio_pendiente (enviado_at, programado_para)
);

-- 3. Sanciones por no votar.
CREATE TABLE IF NOT EXISTS sancion_electoral (
  id_sancion INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_votacion INT NOT NULL,
  motivo VARCHAR(150) NOT NULL DEFAULT 'No participó en la votación',
  fecha_sancion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activa', 'justificada', 'anulada') NOT NULL DEFAULT 'activa',
  observacion VARCHAR(250) NULL DEFAULT NULL,
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_sancion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula) ON DELETE CASCADE,
  CONSTRAINT fk_sancion_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion) ON DELETE CASCADE,
  CONSTRAINT uq_sancion_papeleta UNIQUE (fk_id_votacion, fk_cedula_estudiante)
);
