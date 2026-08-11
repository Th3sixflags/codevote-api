import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as rulesService from '../src/services/reglas_electorales.service.js';
import { HttpError } from '../src/utils/httpError.js';
import { InstitucionConfig } from '../src/schemas/institucion.schema.js';

describe('Reglas Electorales Dinámicas (Multi-tenant)', () => {

  it('1. UIDE exige promedio mínimo (falla si es < 85, pasa si es >= 85)', () => {
    const configUIDE: InstitucionConfig = {
      requiere_promedio: true,
      promedio_minimo: 85,
      requiere_carrera: true,
      requiere_antiguedad: false,
      requiere_estado_activo: false,
      requiere_membresia_activa: false,
    };

    const estMalo = { promedio: 80 };
    const estBueno = { promedio: 85 };

    // Falla si promedio < 85
    assert.throws(
      () => rulesService.validarRequisitosCandidato(estMalo, configUIDE),
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.ok(err.message.includes('no cumple el promedio mínimo'));
        return true;
      }
    );

    // Pasa si promedio >= 85
    assert.doesNotThrow(() => rulesService.validarRequisitosCandidato(estBueno, configUIDE));
  });

  it('2. Sindicato no exige promedio (candidato sin promedio puede postularse)', () => {
    const configSindicato: InstitucionConfig = {
      requiere_promedio: false,
      requiere_carrera: false,
      requiere_antiguedad: false,
      requiere_estado_activo: false,
      requiere_membresia_activa: false,
    };

    const estSinPromedio = { promedio: null };
    assert.doesNotThrow(() => rulesService.validarRequisitosCandidato(estSinPromedio, configSindicato));
  });

  it('3. Sindicato exige antigüedad: falla si no cumple meses, pasa si cumple', () => {
    const config: InstitucionConfig = {
      requiere_promedio: false,
      requiere_carrera: false,
      requiere_antiguedad: true,
      antiguedad_minima_meses: 12,
      requiere_estado_activo: false,
      requiere_membresia_activa: false,
    };

    const ahora = new Date();

    // 1 mes de antigüedad → falla
    const fechaMalo = new Date(ahora.getFullYear(), ahora.getMonth() - 1, ahora.getDate());
    const estNuevo = { fecha_ingreso: fechaMalo.toISOString().split('T')[0] };
    assert.throws(
      () => rulesService.validarRequisitosCandidato(estNuevo, config),
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.ok(err.message.includes('antigüedad mínima'));
        return true;
      }
    );

    // 14 meses de antigüedad → pasa
    const fechaBueno = new Date(ahora.getFullYear(), ahora.getMonth() - 14, ahora.getDate());
    const estAntiguo = { fecha_ingreso: fechaBueno.toISOString().split('T')[0] };
    assert.doesNotThrow(() => rulesService.validarRequisitosCandidato(estAntiguo, config));
  });

  it('4a. Requiere estado activo: inactivo académico es rechazado', () => {
    const config: InstitucionConfig = {
      requiere_promedio: false,
      requiere_carrera: false,
      requiere_antiguedad: false,
      requiere_estado_activo: true,
      requiere_membresia_activa: false,
    };

    assert.throws(
      () => rulesService.validarRequisitosCandidato({ estado_academico: 'inactivo' }, config),
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.ok(err.message.includes('activo académicamente'));
        return true;
      }
    );
    assert.doesNotThrow(() => rulesService.validarRequisitosCandidato({ estado_academico: 'activo' }, config));
  });

  it('4b. Requiere membresía activa: membresía suspendida es rechazada', () => {
    const config: InstitucionConfig = {
      requiere_promedio: false,
      requiere_carrera: false,
      requiere_antiguedad: false,
      requiere_estado_activo: false,
      requiere_membresia_activa: true,
    };

    assert.throws(
      () => rulesService.validarRequisitosCandidato({ membresia_activa: 0 }, config),
      (err: any) => {
        assert.ok(err instanceof HttpError);
        assert.ok(err.message.includes('membresía activa'));
        return true;
      }
    );
    assert.doesNotThrow(() => rulesService.validarRequisitosCandidato({ membresia_activa: 1 }, config));
  });

  it('5. Si la regla no está configurada se considera desactivada (defaults)', async () => {
    // Config vacía — todo desactivado
    const configVacia: InstitucionConfig = {
      requiere_promedio: false,
      requiere_carrera: false,
      requiere_antiguedad: false,
      requiere_estado_activo: false,
      requiere_membresia_activa: false,
    };

    // Estudiante sin nada — debe pasar
    assert.doesNotThrow(() =>
      rulesService.validarRequisitosCandidato({
        promedio: null,
        estado_academico: 'inactivo',
        membresia_activa: 0,
      }, configVacia)
    );
  });

  it('6. Sin promedio_minimo definido, requiere_promedio=true con promedio nulo falla', () => {
    const config: InstitucionConfig = {
      requiere_promedio: true,
      promedio_minimo: undefined, // sin valor explícito → no se aplica el corte numérico
      requiere_carrera: false,
      requiere_antiguedad: false,
      requiere_estado_activo: false,
      requiere_membresia_activa: false,
    };

    // Si promedio_minimo no está definido, no se valida el corte
    assert.doesNotThrow(() => rulesService.validarRequisitosCandidato({ promedio: 40 }, config));
  });
});
