// Utility functions for exporting workflow data

import { Page, Document, ActivityLogEntry, Cotejo } from './types';
import { runCotejosInterdocumentales } from './cotejos-validation';

// CRM-friendly export interfaces
export interface CRMValidation {
  codigo: string;
  nombre: string;
  resultado: "OK" | "WARNING" | "ERROR";
  mensaje: string;
  detalles?: Record<string, string>;
}

export interface CRMDocumento {
  documento_id: string;
  tipo_documental: string;
  paginas: number[];
  extraccion: Record<string, string>;
  validaciones: CRMValidation[];
  resultado_documento: "OK" | "WARNING" | "ERROR";
}

export interface CRMExpediente {
  expediente_id: string;
  fecha_procesamiento: string;
  total_documentos: number;
  total_paginas: number;
  documentos: CRMDocumento[];
  validacion_expediente: {
    validaciones: CRMValidation[];
    resultado_final: "OK" | "WARNING" | "ERROR";
    resumen: {
      documentos_ok: number;
      documentos_warning: number;
      documentos_error: number;
      validaciones_ok: number;
      validaciones_warning: number;
      validaciones_error: number;
    };
  };
}

export interface ExportData {
  documents: Array<{
    documentId: string;
    type: string;
    pageNumbers: number[];
    fields: Record<string, string>;
  }>;
}

function calculateDocumentResult(validations: CRMValidation[]): "OK" | "WARNING" | "ERROR" {
  if (validations.some(v => v.resultado === "ERROR")) return "ERROR";
  if (validations.some(v => v.resultado === "WARNING")) return "WARNING";
  return "OK";
}

function calculateExpedienteResult(
  documentos: CRMDocumento[],
  validacionesExpediente: CRMValidation[]
): "OK" | "WARNING" | "ERROR" {
  const allValidations = [
    ...documentos.flatMap(d => d.validaciones),
    ...validacionesExpediente
  ];
  
  if (allValidations.some(v => v.resultado === "ERROR")) return "ERROR";
  if (allValidations.some(v => v.resultado === "WARNING")) return "WARNING";
  return "OK";
}

export function prepareExportData(
  pages: Page[],
  documents: Document[],
  activityLog: ActivityLogEntry[]
) {
  return {
    documents: documents.map(doc => {
      const docPages = pages.filter(p => doc.pageIds.includes(p.id));
      const extractedFields: Record<string, string> = {};
      
      // Remove confidence from extracted fields
      if (doc.extractedData) {
        Object.entries(doc.extractedData).forEach(([key, value]) => {
          extractedFields[key] = value.value;
        });
      }
      
      return {
        documentId: doc.id,
        type: doc.documentType?.type || 'Unknown',
        pageNumbers: docPages.map(p => p.index + 1),
        fields: extractedFields,
      };
    }),
  };
}

export function prepareCRMExportData(
  pages: Page[],
  documents: Document[]
): CRMExpediente {
  // Run cotejos interdocumentales
  const cotejos = runCotejosInterdocumentales(documents);
  
  // Map documents to CRM format
  const crmDocumentos: CRMDocumento[] = documents.map(doc => {
    const docPages = pages.filter(p => doc.pageIds.includes(p.id));
    
    // Extraccion
    const extraccion: Record<string, string> = {};
    if (doc.extractedData) {
      Object.entries(doc.extractedData).forEach(([key, value]) => {
        extraccion[key] = value.value;
      });
    }
    
    // Validaciones del documento
    const validaciones: CRMValidation[] = (doc.revisiones || []).map(rev => ({
      codigo: rev.id,
      nombre: rev.titulo,
      resultado: rev.severidad,
      mensaje: rev.mensaje,
    }));
    
    return {
      documento_id: doc.id,
      tipo_documental: doc.documentType?.type || 'Desconocido',
      paginas: docPages.map(p => p.index + 1),
      extraccion,
      validaciones,
      resultado_documento: calculateDocumentResult(validaciones),
    };
  });
  
  // Validaciones del expediente (cotejos interdocumentales)
  const validacionesExpediente: CRMValidation[] = cotejos.map(cotejo => {
    const detalles: Record<string, string> = {};
    
    // Add checklist items as detalles
    if (cotejo.checklist) {
      cotejo.checklist.forEach(item => {
        detalles[item.label] = item.checked ? "SI" : "NO";
      });
    }
    
    // Add detalle items
    if (cotejo.detalle) {
      cotejo.detalle.forEach(item => {
        detalles[item.label] = item.value;
      });
    }
    
    return {
      codigo: cotejo.id,
      nombre: cotejo.titulo,
      resultado: cotejo.severidad,
      mensaje: cotejo.mensaje,
      detalles: Object.keys(detalles).length > 0 ? detalles : undefined,
    };
  });
  
  // Calculate summary
  const allDocValidations = crmDocumentos.flatMap(d => d.validaciones);
  const allValidations = [...allDocValidations, ...validacionesExpediente];
  
  const resumen = {
    documentos_ok: crmDocumentos.filter(d => d.resultado_documento === "OK").length,
    documentos_warning: crmDocumentos.filter(d => d.resultado_documento === "WARNING").length,
    documentos_error: crmDocumentos.filter(d => d.resultado_documento === "ERROR").length,
    validaciones_ok: allValidations.filter(v => v.resultado === "OK").length,
    validaciones_warning: allValidations.filter(v => v.resultado === "WARNING").length,
    validaciones_error: allValidations.filter(v => v.resultado === "ERROR").length,
  };
  
  return {
    expediente_id: `EXP-${Date.now()}`,
    fecha_procesamiento: new Date().toISOString(),
    total_documentos: documents.length,
    total_paginas: pages.filter(p => p.status === 'included').length,
    documentos: crmDocumentos,
    validacion_expediente: {
      validaciones: validacionesExpediente,
      resultado_final: calculateExpedienteResult(crmDocumentos, validacionesExpediente),
      resumen,
    },
  };
}

// Convert CRM data to XML
export function crmToXML(data: CRMExpediente): string {
  const escapeXML = (str: string) => 
    str.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&apos;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<expediente>\n';
  xml += `  <expediente_id>${escapeXML(data.expediente_id)}</expediente_id>\n`;
  xml += `  <fecha_procesamiento>${escapeXML(data.fecha_procesamiento)}</fecha_procesamiento>\n`;
  xml += `  <total_documentos>${data.total_documentos}</total_documentos>\n`;
  xml += `  <total_paginas>${data.total_paginas}</total_paginas>\n`;
  
  xml += '  <documentos>\n';
  for (const doc of data.documentos) {
    xml += '    <documento>\n';
    xml += `      <documento_id>${escapeXML(doc.documento_id)}</documento_id>\n`;
    xml += `      <tipo_documental>${escapeXML(doc.tipo_documental)}</tipo_documental>\n`;
    xml += `      <paginas>${doc.paginas.join(',')}</paginas>\n`;
    xml += `      <resultado_documento>${doc.resultado_documento}</resultado_documento>\n`;
    
    xml += '      <extraccion>\n';
    for (const [key, value] of Object.entries(doc.extraccion)) {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      xml += `        <${safeKey}>${escapeXML(value)}</${safeKey}>\n`;
    }
    xml += '      </extraccion>\n';
    
    xml += '      <validaciones>\n';
    for (const val of doc.validaciones) {
      xml += '        <validacion>\n';
      xml += `          <codigo>${escapeXML(val.codigo)}</codigo>\n`;
      xml += `          <nombre>${escapeXML(val.nombre)}</nombre>\n`;
      xml += `          <resultado>${val.resultado}</resultado>\n`;
      xml += `          <mensaje>${escapeXML(val.mensaje)}</mensaje>\n`;
      xml += '        </validacion>\n';
    }
    xml += '      </validaciones>\n';
    
    xml += '    </documento>\n';
  }
  xml += '  </documentos>\n';
  
  xml += '  <validacion_expediente>\n';
  xml += `    <resultado_final>${data.validacion_expediente.resultado_final}</resultado_final>\n`;
  
  xml += '    <resumen>\n';
  xml += `      <documentos_ok>${data.validacion_expediente.resumen.documentos_ok}</documentos_ok>\n`;
  xml += `      <documentos_warning>${data.validacion_expediente.resumen.documentos_warning}</documentos_warning>\n`;
  xml += `      <documentos_error>${data.validacion_expediente.resumen.documentos_error}</documentos_error>\n`;
  xml += `      <validaciones_ok>${data.validacion_expediente.resumen.validaciones_ok}</validaciones_ok>\n`;
  xml += `      <validaciones_warning>${data.validacion_expediente.resumen.validaciones_warning}</validaciones_warning>\n`;
  xml += `      <validaciones_error>${data.validacion_expediente.resumen.validaciones_error}</validaciones_error>\n`;
  xml += '    </resumen>\n';
  
  xml += '    <validaciones>\n';
  for (const val of data.validacion_expediente.validaciones) {
    xml += '      <validacion>\n';
    xml += `        <codigo>${escapeXML(val.codigo)}</codigo>\n`;
    xml += `        <nombre>${escapeXML(val.nombre)}</nombre>\n`;
    xml += `        <resultado>${val.resultado}</resultado>\n`;
    xml += `        <mensaje>${escapeXML(val.mensaje)}</mensaje>\n`;
    if (val.detalles) {
      xml += '        <detalles>\n';
      for (const [key, value] of Object.entries(val.detalles)) {
        const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
        xml += `          <${safeKey}>${escapeXML(value)}</${safeKey}>\n`;
      }
      xml += '        </detalles>\n';
    }
    xml += '      </validacion>\n';
  }
  xml += '    </validaciones>\n';
  
  xml += '  </validacion_expediente>\n';
  xml += '</expediente>';
  
  return xml;
}

export function downloadJSON(data: any) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `workflow-export-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCRMJSON(pages: Page[], documents: Document[]) {
  const data = prepareCRMExportData(pages, documents);
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expediente-crm-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCRMXML(pages: Page[], documents: Document[]) {
  const data = prepareCRMExportData(pages, documents);
  const xmlString = crmToXML(data);
  const blob = new Blob([xmlString], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expediente-crm-${Date.now()}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCSV(data: any) {
  const rows: string[][] = [];
  
  // Header row
  rows.push([
    'Documento ID',
    'Tipo de Documento',
    'Páginas',
    'Campo',
    'Valor',
  ]);

  // Data rows
  data.documents.forEach((doc: any) => {
    if (doc.fields && Object.keys(doc.fields).length > 0) {
      Object.entries(doc.fields).forEach(([fieldName, fieldValue]) => {
        const pageRange = doc.pageNumbers.length === 1 
          ? `'${doc.pageNumbers[0]}`
          : `'${doc.pageNumbers[0]}-${doc.pageNumbers[doc.pageNumbers.length - 1]}`;
        // </CHANGE>
        
        rows.push([
          doc.documentId,
          doc.type,
          pageRange,
          fieldName,
          String(fieldValue),
        ]);
      });
    } else {
      const pageRange = doc.pageNumbers.length === 1 
        ? `'${doc.pageNumbers[0]}`
        : `'${doc.pageNumbers[0]}-${doc.pageNumbers[doc.pageNumbers.length - 1]}`;
      // </CHANGE>
      
      rows.push([
        doc.documentId,
        doc.type,
        pageRange,
        'N/A',
        'N/A',
      ]);
    }
  });

  const csvString = rows
    .map(row => row.join(';'))
    .join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `workflow-export-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadDocumentJSON(doc: any, index: number) {
  const data = { documents: [doc] };
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `documento-${index + 1}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadDocumentCSV(doc: any, index: number) {
  const rows: string[][] = [];
  
  // Header row
  rows.push([
    'Documento ID',
    'Tipo de Documento',
    'Páginas',
    'Campo',
    'Valor',
  ]);

  // Data rows
  if (doc.fields && Object.keys(doc.fields).length > 0) {
    Object.entries(doc.fields).forEach(([fieldName, fieldValue]) => {
      const pageRange = doc.pageNumbers.length === 1 
        ? `'${doc.pageNumbers[0]}`
        : `'${doc.pageNumbers[0]}-${doc.pageNumbers[doc.pageNumbers.length - 1]}`;
      // </CHANGE>
      
      rows.push([
        doc.documentId,
        doc.type,
        pageRange,
        fieldName,
        String(fieldValue),
      ]);
    });
  }

  const csvString = rows
    .map(row => row.join(';'))
    .join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `documento-${index + 1}-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
