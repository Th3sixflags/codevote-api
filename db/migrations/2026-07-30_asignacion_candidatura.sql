-- =============================================================================
-- Migración: asignación administrativa de candidaturas
-- Fecha: 2026-07-30
-- =============================================================================
-- El candidato ya no elige libremente proceso, carrera ni papeleta: el
-- administrador le asigna UNA papeleta (votación) y el portal del candidato
-- trabaja solo con esa asignación.
--
-- fk_cedula_estudiante es UNIQUE: cada persona tiene como máximo una asignación.
-- Reasignar actualiza esa misma fila; retirar la elimina físicamente.
--
-- IDEMPOTENTE.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-30_asignacion_candidatura.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

CREATE TABLE IF NOT EXISTS asignacion_candidatura (
  id_asignacion INT AUTO_INCREMENT PRIMARY KEY,
  fk_cedula_estudiante CHAR(10) NOT NULL,
  fk_id_votacion INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activa', 'retirada') NOT NULL DEFAULT 'activa',
  -- Una sola asignación por persona.
  CONSTRAINT uq_asignacion_estudiante UNIQUE (fk_cedula_estudiante),
  CONSTRAINT fk_asignacion_estudiante FOREIGN KEY (fk_cedula_estudiante) REFERENCES estudiante(cedula),
  CONSTRAINT fk_asignacion_votacion FOREIGN KEY (fk_id_votacion) REFERENCES votacion(id_votacion)
);
