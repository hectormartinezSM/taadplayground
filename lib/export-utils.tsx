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

export function downloadJSON(pages: Page[], documents: Document[]) {
  const data = prepareCRMExportData(pages, documents);
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expediente-${data.expediente_id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadDocumentJSON(doc: Document, pages: Page[], index: number) {
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
  
  const data: CRMDocumento = {
    documento_id: doc.id,
    tipo_documental: doc.documentType?.type || 'Desconocido',
    paginas: docPages.map(p => p.index + 1),
    extraccion,
    validaciones,
    resultado_documento: calculateDocumentResult(validaciones),
  };
  
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `documento-${index + 1}-${doc.documentType?.type || 'desconocido'}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
