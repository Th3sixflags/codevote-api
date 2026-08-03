/**
 * Validación de los campos de entrada.
 *
 * El objetivo es que cada campo acepte solo lo que le corresponde: los nombres
 * no pueden ser números y el promedio va en la escala 0–100. Antes
 * `nombres: z.string().min(1)` dejaba pasar "12345" como nombre de persona.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nombrePersonaSchema } from '../src/schemas/common.js';
import { crearEstudianteSchema } from '../src/schemas/estudiante.schema.js';

const BASE = {
  cedula: '1710000173',
  nombres: 'María',
  apellidos: 'González',
  correo_institucional: 'mgonzalez@uide.edu.ec',
  password: 'password123',
};

test('un nombre hecho de números se rechaza', () => {
  for (const valor of ['12345', '12345 6789', '007', '3']) {
    assert.equal(nombrePersonaSchema.safeParse(valor).success, false, `debería rechazar ${valor}`);
  }
});

test('un nombre con dígitos o símbolos intercalados se rechaza', () => {
  for (const valor of ['Pé4rez', 'Ana99', 'Juan@Carlos', '<script>', 'Luis_Mora', 'Ana!']) {
    assert.equal(nombrePersonaSchema.safeParse(valor).success, false, `debería rechazar ${valor}`);
  }
});

test('se aceptan los nombres reales, con tildes, ñ, apóstrofos y guiones', () => {
  for (const valor of ['María', 'Ñusta', 'José Andrés', "D'Angelo", 'Pérez-Mora', 'Iñárritu']) {
    const r = nombrePersonaSchema.safeParse(valor);
    assert.equal(r.success, true, `debería aceptar ${valor}: ${JSON.stringify(r.error?.issues)}`);
  }
});

test('los espacios sobrantes se recortan y los internos se colapsan', () => {
  assert.equal(nombrePersonaSchema.parse('  Juan   Carlos  '), 'Juan Carlos');
});

test('una sola letra no basta como nombre', () => {
  assert.equal(nombrePersonaSchema.safeParse('A').success, false);
});

test('crear estudiante rechaza nombres y apellidos numéricos', () => {
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, nombres: '12345' }).success, false);
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, apellidos: '999' }).success, false);
});

test('crear estudiante acepta un alta correcta', () => {
  const r = crearEstudianteSchema.safeParse({ ...BASE, promedio: 88.5 });
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('el promedio vive en la escala 0–100 y rechaza lo que se salga', () => {
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, promedio: 101 }).success, false);
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, promedio: -1 }).success, false);
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, promedio: NaN }).success, false);
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, promedio: 0 }).success, true);
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, promedio: 100 }).success, true);
});

test('un correo mal formado se rechaza', () => {
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, correo_institucional: 'noesuncorreo' }).success, false);
});

test('la cédula debe ser numérica y con dígito verificador correcto', () => {
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, cedula: 'abcdefghij' }).success, false);
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, cedula: '1710000174' }).success, false, 'verificador incorrecto');
  assert.equal(crearEstudianteSchema.safeParse({ ...BASE, cedula: '171000017' }).success, false, 'faltan dígitos');
});
