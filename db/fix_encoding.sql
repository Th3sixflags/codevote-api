-- ==============================================================================
-- SCRIPT DE CORRECCIÓN: Arreglo de registros doblemente codificados (ej: Ã³, Ã±)
-- ==============================================================================
-- Este script es para ejecución manual sobre los datos en producción.
-- Utiliza CONVERT(CAST(CONVERT(campo USING latin1) AS BINARY) USING utf8mb4)
-- para reparar aquellos textos que fueron insertados vía una conexión que
-- trataba utf8 como latin1.
-- Ojo: No correr esto sobre datos que ya estén correctos, o corromperá
-- los datos buenos. Se recomienda respaldar (dump) antes.

-- Ejemplo seguro identificando el prefijo característico "Ã":

UPDATE institucion 
SET nombre = CONVERT(CAST(CONVERT(nombre USING latin1) AS BINARY) USING utf8mb4)
WHERE nombre LIKE '%Ã%';

UPDATE institucion 
SET descripcion = CONVERT(CAST(CONVERT(descripcion USING latin1) AS BINARY) USING utf8mb4)
WHERE descripcion LIKE '%Ã%';

UPDATE estudiante 
SET nombres = CONVERT(CAST(CONVERT(nombres USING latin1) AS BINARY) USING utf8mb4)
WHERE nombres LIKE '%Ã%';

UPDATE estudiante 
SET apellidos = CONVERT(CAST(CONVERT(apellidos USING latin1) AS BINARY) USING utf8mb4)
WHERE apellidos LIKE '%Ã%';

UPDATE proceso_electoral 
SET nombre_proceso = CONVERT(CAST(CONVERT(nombre_proceso USING latin1) AS BINARY) USING utf8mb4)
WHERE nombre_proceso LIKE '%Ã%';

UPDATE lista 
SET nombre_lista = CONVERT(CAST(CONVERT(nombre_lista USING latin1) AS BINARY) USING utf8mb4)
WHERE nombre_lista LIKE '%Ã%';

UPDATE propuesta 
SET titulo = CONVERT(CAST(CONVERT(titulo USING latin1) AS BINARY) USING utf8mb4)
WHERE titulo LIKE '%Ã%';

UPDATE propuesta 
SET descripcion = CONVERT(CAST(CONVERT(descripcion USING latin1) AS BINARY) USING utf8mb4)
WHERE descripcion LIKE '%Ã%';
