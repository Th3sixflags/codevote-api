-- =============================================================================
-- Migración de datos: promedios de escala 0–10 a escala 0–100
-- Fecha: 2026-07-29
-- =============================================================================
-- La universidad maneja notas sobre 100. Los estudiantes cargados originalmente
-- tenían el promedio en escala 0–10, así que se multiplican por 10.
--
-- SEGURA / IDEMPOTENTE: solo convierte los que TODAVÍA están en escala 0–10
-- (promedio <= 10). Si se ejecuta de nuevo, los ya convertidos (> 10) quedan
-- fuera del WHERE y no se vuelven a multiplicar. Se limita a 100 por seguridad.
--
--   sudo docker exec -i codevote-mysql mysql -u root -p codevote_db < 2026-07-29_promedios_a_100.sql
-- =============================================================================

SET NAMES utf8mb4;
USE codevote_db;

UPDATE estudiante
SET promedio = LEAST(ROUND(promedio * 10, 2), 100)
WHERE promedio IS NOT NULL AND promedio <= 10;
