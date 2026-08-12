import PDFDocument from 'pdfkit';
import { pool } from '../config/database.js';
import { HttpError } from '../utils/httpError.js';
import * as procesoRepo from '../repositories/proceso_electoral.repository.js';
import fetch from 'node-fetch';

/**
 * Función auxiliar para dibujar tablas manuales en PDFKit
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  startX: number,
  startY: number,
  columnWidths: number[],
  primaryColor: string
) {
  const rowHeight = 25;
  const padding = 5;
  let currentY = startY;

  // Dibujar encabezados
  doc.rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight).fill(primaryColor);
  doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold');
  let currentX = startX;
  headers.forEach((header, i) => {
    doc.text(header, currentX + padding, currentY + 7, {
      width: columnWidths[i] - padding * 2,
      align: 'left'
    });
    currentX += columnWidths[i];
  });

  currentY += rowHeight;
  doc.fillColor('#333333').font('Helvetica');

  // Dibujar filas
  rows.forEach((row, rowIndex) => {
    // Salto de página si la fila no entra
    if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      currentY = doc.page.margins.top;
      // Re-dibujar encabezados
      doc.rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight).fill(primaryColor);
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold');
      let hX = startX;
      headers.forEach((header, i) => {
        doc.text(header, hX + padding, currentY + 7, { width: columnWidths[i] - padding * 2, align: 'left' });
        hX += columnWidths[i];
      });
      currentY += rowHeight;
      doc.fillColor('#333333').font('Helvetica');
    }

    // Fondo alternado
    if (rowIndex % 2 === 0) {
      doc.rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#F9F9F9');
    }
    doc.fillColor('#333333');

    let rX = startX;
    row.forEach((cell, i) => {
      doc.text(cell, rX + padding, currentY + 7, {
        width: columnWidths[i] - padding * 2,
        align: 'left',
        lineBreak: false
      });
      rX += columnWidths[i];
    });

    currentY += rowHeight;
  });

  // Borde exterior
  doc.rect(startX, startY, columnWidths.reduce((a, b) => a + b, 0), currentY - startY).strokeColor('#E0E0E0').stroke();

  return currentY + 20; // Devolver posición Y final
}

export async function generarExpedientePDF(procesoId: number, institucionId?: number): Promise<Buffer> {
  const proceso = await procesoRepo.findById(procesoId, institucionId);
  if (!proceso) {
    throw new HttpError(404, 'Proceso electoral no encontrado o acceso denegado.');
  }

  // Flexibilidad para descargar expedientes de procesos cancelados también
  if (proceso.estado !== 'finalizado' && proceso.estado !== 'cancelado') {
    throw new HttpError(409, 'El expediente solo puede generarse para procesos finalizados o cancelados.');
  }

  // 1. Obtener datos de la Institución
  const [instRows] = await pool.query(
    'SELECT nombre, logo_url, colores_json FROM institucion WHERE id_institucion = ?',
    [proceso.fk_id_institucion]
  ) as [any[], any];
  
  if (instRows.length === 0) {
    throw new HttpError(404, 'Institución no encontrada.');
  }
  const org = instRows[0];
  const primaryColor = org.colores_json?.primary || '#4B0D2B';
  const secondaryColor = org.colores_json?.secondary || '#F7F3F0';

  // 2. Obtener votaciones (Papeletas) vinculadas a la institución a través del proceso
  const [votaciones] = await pool.query(`
    SELECT v.*, c.nombre_carrera 
    FROM votacion v 
    JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
    LEFT JOIN carrera c ON v.fk_id_carrera = c.id_carrera 
    WHERE v.fk_id_proceso = ? AND p.fk_id_institucion = ?
  `, [procesoId, proceso.fk_id_institucion]) as [any[], any];

  // 3. Generar el PDF
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true // Necesario para numeración de páginas
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 50;
      const contentWidth = doc.page.width - margin * 2;

      // Evento para encabezados y pies de página (se ejecutará al final cuando bufferPages = true)
      doc.on('pageAdded', () => {
        // El pie de página se dibuja al final recorriendo las páginas
      });

      // --- Portada Institucional ---
      // Franja decorativa superior
      doc.rect(0, 0, doc.page.width, 10).fill(primaryColor);
      doc.moveDown(3);

      doc.fillColor(primaryColor).fontSize(28).font('Helvetica-Bold').text(org.nombre, { align: 'center' });
      doc.moveDown(1);
      
      doc.fillColor('#555555').fontSize(16).font('Helvetica').text('EXPEDIENTE ELECTORAL OFICIAL', { align: 'center', characterSpacing: 2 });
      doc.moveDown(2);

      doc.rect(margin, doc.y, contentWidth, 2).fill(secondaryColor);
      doc.moveDown(2);

      doc.fillColor('#222222').fontSize(22).font('Helvetica-Bold').text(proceso.nombre_proceso, { align: 'center' });
      doc.moveDown(2);

      // Bloque de metadatos del proceso
      const metaY = doc.y;
      doc.rect(margin, metaY, contentWidth, 120).fill('#FAFAFA').strokeColor('#E0E0E0').stroke();
      
      doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold');
      doc.text('CÓDIGO DE PROCESO:', margin + 20, metaY + 20);
      doc.font('Helvetica').text(`PRC-${procesoId.toString().padStart(6, '0')}`, margin + 180, metaY + 20);

      doc.font('Helvetica-Bold').text('ESTADO OFICIAL:', margin + 20, metaY + 45);
      doc.font('Helvetica').text(proceso.estado.toUpperCase(), margin + 180, metaY + 45);

      doc.font('Helvetica-Bold').text('FECHA CONVOCATORIA:', margin + 20, metaY + 70);
      doc.font('Helvetica').text(new Date(proceso.fecha_convocatoria).toLocaleDateString('es-ES'), margin + 180, metaY + 70);

      doc.font('Helvetica-Bold').text('PERIODO DE VOTACIÓN:', margin + 20, metaY + 95);
      doc.font('Helvetica').text(`${new Date(proceso.fecha_inicio_votacion).toLocaleDateString('es-ES')} al ${new Date(proceso.fecha_fin_votacion).toLocaleDateString('es-ES')}`, margin + 180, metaY + 95);

      doc.y = metaY + 150;
      doc.fillColor('#777777').fontSize(10).font('Helvetica-Oblique').text(`Generado el: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });

      // --- Detalles por Papeleta ---
      for (const v of votaciones) {
        doc.addPage();
        
        // Título de la papeleta
        doc.fillColor(primaryColor).fontSize(18).font('Helvetica-Bold').text(`PAPELETA: ${v.titulo_papeleta.toUpperCase()}`);
        doc.fillColor('#666666').fontSize(12).font('Helvetica').text(`Alcance: ${v.nombre_carrera ? v.nombre_carrera : 'Global Institucional'}`);
        doc.moveDown(1.5);

        // Obtener resumen estadístico
        const [actas] = await pool.query(`
          SELECT a.* FROM acta_resultados a 
          JOIN votacion v ON a.fk_id_votacion = v.id_votacion
          JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
          WHERE a.fk_id_votacion = ? AND p.fk_id_institucion = ?
        `, [v.id_votacion, proceso.fk_id_institucion]) as [any[], any];
        const acta = actas[0] || null;

        // Universo
        const [padron] = await pool.query(`
          SELECT COUNT(*) as total FROM codigo_voto c 
          JOIN votacion v ON c.fk_id_votacion = v.id_votacion
          JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
          WHERE c.fk_id_votacion = ? AND p.fk_id_institucion = ?
        `, [v.id_votacion, proceso.fk_id_institucion]) as [any[], any];
        const universo = padron[0].total;

        // Tarjetas Estadísticas
        doc.fillColor('#222222').fontSize(14).font('Helvetica-Bold').text('Resumen Estadístico');
        doc.moveDown(0.5);

        const statY = doc.y;
        const cardWidth = (contentWidth - 20) / 3;

        // Helper para tarjetas
        const drawStatCard = (title: string, value: string, x: number, y: number) => {
          doc.rect(x, y, cardWidth, 60).fill('#F8F9FA').strokeColor('#E9ECEF').stroke();
          doc.fillColor('#555555').fontSize(10).font('Helvetica').text(title, x, y + 10, { width: cardWidth, align: 'center' });
          doc.fillColor(primaryColor).fontSize(18).font('Helvetica-Bold').text(value, x, y + 25, { width: cardWidth, align: 'center' });
        };

        const totalVotantes = acta ? acta.total_votantes : 0;
        const participacion = universo > 0 ? ((totalVotantes / universo) * 100).toFixed(2) : '0.00';

        drawStatCard('Universo Habilitado', universo.toString(), margin, statY);
        drawStatCard('Votos Emitidos', totalVotantes.toString(), margin + cardWidth + 10, statY);
        drawStatCard('Participación', `${participacion}%`, margin + (cardWidth + 10) * 2, statY);

        doc.y = statY + 75;

        if (acta) {
          const breakdownY = doc.y;
          drawStatCard('Votos Válidos', acta.votos_validos.toString(), margin, breakdownY);
          drawStatCard('Votos Blancos', acta.votos_blanco.toString(), margin + cardWidth + 10, breakdownY);
          drawStatCard('Votos Nulos', acta.votos_nulos.toString(), margin + (cardWidth + 10) * 2, breakdownY);
          doc.y = breakdownY + 80;

          // Ganador
          doc.rect(margin, doc.y, contentWidth, 40).fill(secondaryColor);
          doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text(`GANADOR OFICIAL: ${acta.lista_ganadora || 'EMPATE / SIN DEFINIR'}`, margin, doc.y + 13, { width: contentWidth, align: 'center' });
          doc.moveDown(3);
        } else {
          doc.fillColor('#888888').fontSize(12).font('Helvetica-Oblique').text('Acta de resultados aún no generada.');
          doc.moveDown(2);
        }

        // --- Listas y Candidatos ---
        doc.fillColor('#222222').fontSize(14).font('Helvetica-Bold').text('Listas Aprobadas y Candidatos');
        doc.moveDown(0.5);

        const [listas] = await pool.query(`
          SELECT l.* FROM lista_candidata l 
          JOIN votacion v ON l.fk_id_votacion = v.id_votacion
          JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
          WHERE l.fk_id_votacion = ? AND l.estado_revision = 'aprobada' AND p.fk_id_institucion = ?
        `, [v.id_votacion, proceso.fk_id_institucion]) as [any[], any];

        if (listas.length === 0) {
          doc.fillColor('#888888').fontSize(11).font('Helvetica').text('No se registraron listas aprobadas para esta papeleta.');
          doc.moveDown(1);
        }

        for (const l of listas) {
          doc.rect(margin, doc.y, contentWidth, 20).fill('#EAEAEA');
          doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text(`Lista: ${l.nombre_lista} ${l.lema ? ` - "${l.lema}"` : ''}`, margin + 10, doc.y + 4);
          doc.moveDown(1.5);

          const [candidatos] = await pool.query(`
            SELECT c.cargo, e.nombres, e.apellidos 
            FROM candidato c 
            JOIN estudiante e ON c.fk_cedula_estudiante = e.cedula 
            JOIN lista_candidata l ON c.fk_id_lista = l.id_lista
            JOIN votacion v ON l.fk_id_votacion = v.id_votacion
            JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
            WHERE c.fk_id_lista = ? AND p.fk_id_institucion = ?
            ORDER BY c.cargo ASC
          `, [l.id_lista, proceso.fk_id_institucion]) as [any[], any];

          const candRows = candidatos.map((c: any) => [c.cargo, `${c.nombres} ${c.apellidos}`]);
          
          if (candRows.length > 0) {
            doc.y = drawTable(doc, ['Cargo', 'Candidato'], candRows, margin, doc.y, [150, contentWidth - 150], primaryColor);
          } else {
            doc.fillColor('#888888').fontSize(10).font('Helvetica-Oblique').text('Sin candidatos registrados.', margin);
            doc.moveDown(1);
          }

          // Propuestas
          const [planes] = await pool.query(`
            SELECT pl.area, pl.archivo_url 
            FROM plan_trabajo pl 
            JOIN lista_candidata l ON pl.fk_id_lista = l.id_lista
            JOIN votacion v ON l.fk_id_votacion = v.id_votacion
            JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
            WHERE pl.fk_id_lista = ? AND p.fk_id_institucion = ?
          `, [l.id_lista, proceso.fk_id_institucion]) as [any[], any];

          if (planes.length > 0) {
            const planRows = planes.map((p: any) => [p.area, p.archivo_url ? 'Sí (Documento adjunto en plataforma)' : 'No provisto']);
            doc.y = drawTable(doc, ['Área de Trabajo', 'Plan / Propuesta'], planRows, margin, doc.y, [150, contentWidth - 150], '#6c757d');
          }
        }

        // --- Auditoría / Veedurías ---
        doc.moveDown(1);
        doc.fillColor('#222222').fontSize(14).font('Helvetica-Bold').text('Registro de Veedurías');
        doc.moveDown(0.5);

        const [veedurias] = await pool.query(`
          SELECT vd.momento, vd.observacion, ve.nombre, ve.tipo_veedor 
          FROM veeduria vd 
          JOIN veedor ve ON vd.fk_id_veedor = ve.id_veedor 
          JOIN votacion v ON vd.fk_id_votacion = v.id_votacion
          JOIN proceso_electoral p ON v.fk_id_proceso = p.id_proceso
          WHERE vd.fk_id_votacion = ? AND p.fk_id_institucion = ?
          ORDER BY vd.momento ASC
        `, [v.id_votacion, proceso.fk_id_institucion]) as [any[], any];

        if (veedurias.length === 0) {
          doc.fillColor('#888888').fontSize(11).font('Helvetica').text('No se registraron veedurías ni observaciones en esta papeleta.');
          doc.moveDown(1);
        } else {
          const vdRows = veedurias.map((vd: any) => [
            vd.momento.toUpperCase(),
            `${vd.nombre} (${vd.tipo_veedor})`,
            vd.observacion || 'Sin observaciones'
          ]);
          doc.y = drawTable(doc, ['Etapa', 'Veedor', 'Observación'], vdRows, margin, doc.y, [100, 150, contentWidth - 250], primaryColor);
        }
      }

      // --- Certificación y Sellos Finales ---
      doc.addPage();
      doc.rect(margin, margin, contentWidth, doc.page.height - margin * 2).strokeColor(primaryColor).stroke();
      
      doc.y = margin + 50;
      doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text('CERTIFICACIÓN DE ANONIMATO', { align: 'center' });
      doc.moveDown(2);
      
      doc.fillColor('#333333').fontSize(12).font('Helvetica').text(
        'El sistema CodeVote certifica de manera criptográfica y algorítmica que la identidad de cada ' +
        'votante ha sido irreversiblemente desvinculada del sentido de su voto.', { align: 'justify', width: contentWidth - 80, indent: 40 });
      doc.moveDown(1);
      
      doc.text(
        'El padrón electoral registra exclusivamente la generación de comprobantes (Códigos de Voto) como prueba ' +
        'de participación, previniendo el fraude y garantizando el principio universal del sufragio secreto.', { align: 'justify', width: contentWidth - 80, indent: 40 });
      doc.moveDown(2);

      doc.font('Helvetica-Bold').text('AUDITORÍA DE INTEGRIDAD', { align: 'center' });
      doc.moveDown(1);
      
      doc.font('Helvetica').text(`Institución: ${org.nombre}`, { align: 'center' });
      doc.text(`Identificador de Proceso: PRC-${procesoId.toString().padStart(6, '0')}`, { align: 'center' });
      doc.text(`Fecha de Emisión del Expediente: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
      
      doc.moveDown(4);
      doc.rect(doc.page.width / 2 - 100, doc.y, 200, 1).fill('#CCCCCC');
      doc.moveDown(1);
      doc.fillColor('#777777').fontSize(10).font('Helvetica-Oblique').text('Generado automáticamente por el Sistema Electoral CodeVote', { align: 'center' });

      // --- Numeración de Páginas y Encabezados Globales ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // Encabezado (excepto en portada y contraportada)
        if (i > 0 && i < pages.count - 1) {
          doc.fillColor('#999999').fontSize(8).font('Helvetica').text(`PROCESO: ${proceso.nombre_proceso.toUpperCase()}`, margin, 30);
          doc.text(org.nombre.toUpperCase(), margin, 30, { align: 'right' });
          doc.rect(margin, 42, contentWidth, 0.5).fill('#E0E0E0');
        }

        // Pie de página (en todas)
        doc.rect(margin, doc.page.height - 40, contentWidth, 0.5).fill('#E0E0E0');
        doc.fillColor('#999999').fontSize(9).font('Helvetica').text(`Página ${i + 1} de ${pages.count}`, margin, doc.page.height - 30, { align: 'center' });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
