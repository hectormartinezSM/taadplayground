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

// ============================================================
// V4 CRM Export Format Interfaces
// ============================================================

export interface V4Campo {
  campo: string;
  valor: unknown;
}

export interface V4Validacion {
  codigo: string;
  nombre: string;
  resultado: "OK" | "WARNING" | "ERROR";
  detalles?: Record<string, string>;
  // Note: 'mensaje' and 'desglose' are intentionally excluded
}

export interface V4Documento {
  documento_id: string;
  tipo_documental: string;
  paginas: number[];
  campos: V4Campo[];
  validaciones: V4Validacion[];
  resultado_documento: "OK" | "WARNING" | "ERROR";
}

export interface V4Expediente {
  version_esquema: "crm_export_es_v4";
  expediente_id: string;
  fecha_procesamiento: string;
  totales: {
    documentos: number;
    paginas: number;
  };
  documentos: V4Documento[];
  validacion_expediente?: {
    validaciones: V4Validacion[];
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

export interface V4DocumentoIndividual {
  version_esquema: "crm_export_es_v4_documento";
  documento_id: string;
  tipo_documental: string;
  paginas: number[];
  campos: V4Campo[];
  validaciones: V4Validacion[];
  resultado_documento: "OK" | "WARNING" | "ERROR";
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

// ============================================================
// PRO to V4 Conversion Functions
// ============================================================

/**
 * Attempts to parse a string as a JSON array.
 * Returns the parsed array if successful, otherwise returns the original value.
 */
function tryParseJsonArray(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  
  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) return value;
  
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return value;
  } catch {
    return value;
  }
}

/**
 * Transforms the 'extraccion' object to 'campos' array format.
 * Parses any string values that are valid JSON arrays.
 */
function transformExtraccionToCampos(extraccion: Record<string, unknown>): V4Campo[] {
  const campos: V4Campo[] = [];
  
  for (const [key, value] of Object.entries(extraccion)) {
    campos.push({
      campo: key,
      valor: tryParseJsonArray(value),
    });
  }
  
  return campos;
}

/**
 * Recursively removes 'mensaje' and 'desglose' keys from an object or array.
 * Preserves all other fields.
 */
function removeMessageAndDesglose<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeMessageAndDesglose(item)) as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip 'mensaje' and 'desglose' keys
      if (key === 'mensaje' || key === 'desglose') {
        continue;
      }
      
      // Recursively process nested objects/arrays
      result[key] = removeMessageAndDesglose(value);
    }
    
    return result as T;
  }
  
  return obj;
}

/**
 * Removes the 'indice' field from root level if it exists.
 */
function removeIndice<T extends Record<string, unknown>>(obj: T): Omit<T, 'indice'> {
  const { indice, ...rest } = obj;
  return rest as Omit<T, 'indice'>;
}

/**
 * Converts a PRO format expediente to V4 format.
 * 
 * Input (PRO):
 * - expediente_id, fecha_procesamiento, total_documentos, total_paginas
 * - documentos: [{ documento_id, tipo_documental, paginas, extraccion, validaciones, resultado_documento }]
 * - validacion_expediente (optional)
 * - indice (to be removed)
 * 
 * Output (V4):
 * - version_esquema: "crm_export_es_v4"
 * - expediente_id, fecha_procesamiento
 * - totales: { documentos, paginas }
 * - documentos: [{ ..., campos: [{campo, valor}], validaciones: (without mensaje/desglose) }]
 * - validacion_expediente (without mensaje/desglose)
 */
export function convertExpedienteProToV4(proExpediente: CRMExpediente & { indice?: unknown }): V4Expediente {
  // Remove 'indice' from root
  const expedienteSinIndice = removeIndice(proExpediente);
  
  // Transform documents
  const v4Documentos: V4Documento[] = expedienteSinIndice.documentos.map(doc => {
    // Transform extraccion to campos
    const campos = transformExtraccionToCampos(doc.extraccion as Record<string, unknown>);
    
    // Remove mensaje and desglose from validaciones
    const validaciones = removeMessageAndDesglose(doc.validaciones) as V4Validacion[];
    
    return {
      documento_id: doc.documento_id,
      tipo_documental: doc.tipo_documental,
      paginas: doc.paginas,
      campos,
      validaciones,
      resultado_documento: doc.resultado_documento,
    };
  });
  
  // Build base V4 expediente
  const v4Expediente: V4Expediente = {
    version_esquema: "crm_export_es_v4",
    expediente_id: expedienteSinIndice.expediente_id,
    fecha_procesamiento: expedienteSinIndice.fecha_procesamiento,
    totales: {
      documentos: expedienteSinIndice.total_documentos,
      paginas: expedienteSinIndice.total_paginas,
    },
    documentos: v4Documentos,
  };
  
  // Transform validacion_expediente if exists
  if (expedienteSinIndice.validacion_expediente) {
    v4Expediente.validacion_expediente = removeMessageAndDesglose(
      expedienteSinIndice.validacion_expediente
    ) as V4Expediente['validacion_expediente'];
  }
  
  return v4Expediente;
}

/**
 * Converts a PRO format documento individual to V4 format.
 * 
 * Input (PRO documento):
 * - documento_id, tipo_documental, paginas, extraccion, validaciones, resultado_documento
 * 
 * Output (V4 documento):
 * - version_esquema: "crm_export_es_v4_documento"
 * - documento_id, tipo_documental, paginas
 * - campos: [{campo, valor}]
 * - validaciones: (without mensaje/desglose)
 * - resultado_documento
 */
export function convertDocumentoProToV4(proDocumento: CRMDocumento): V4DocumentoIndividual {
  // Transform extraccion to campos
  const campos = transformExtraccionToCampos(proDocumento.extraccion as Record<string, unknown>);
  
  // Remove mensaje and desglose from validaciones
  const validaciones = removeMessageAndDesglose(proDocumento.validaciones) as V4Validacion[];
  
  return {
    version_esquema: "crm_export_es_v4_documento",
    documento_id: proDocumento.documento_id,
    tipo_documental: proDocumento.tipo_documental,
    paginas: proDocumento.paginas,
    campos,
    validaciones,
    resultado_documento: proDocumento.resultado_documento,
  };
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
  const proData = prepareCRMExportData(pages, documents);
  // Convert PRO format to V4 format
  const v4Data = convertExpedienteProToV4(proData);
  const jsonString = JSON.stringify(v4Data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expediente-${v4Data.expediente_id}.json`;
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
  
  const proData: CRMDocumento = {
    documento_id: doc.id,
    tipo_documental: doc.documentType?.type || 'Desconocido',
    paginas: docPages.map(p => p.index + 1),
    extraccion,
    validaciones,
    resultado_documento: calculateDocumentResult(validaciones),
  };
  
  // Convert PRO format to V4 format
  const v4Data = convertDocumentoProToV4(proData);
  
  const jsonString = JSON.stringify(v4Data, null, 2);
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
