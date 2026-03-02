// Utility functions for exporting workflow data - Integration-oriented JSON format

import { Page, Document, ActivityLogEntry } from './types';
import { runCotejosInterdocumentales } from './cotejos-validation';

// ============================================================
// TYPE DEFINITIONS - Integration Schema v1.0
// ============================================================

type CheckStatus = "OK" | "WARNING" | "ERROR";
type CheckCategory = "IDENTITY" | "RECENCY" | "AMOUNTS" | "CONSISTENCY" | "COMPLETENESS" | "FORMAT";
type DocumentTypeCode = "DNI" | "PAYSLIP" | "IRPF_100" | "WORK_LIFE" | "LAND_REGISTRY_NOTE" | "WORK_CONTRACT" | "UNKNOWN";
type FieldStatus = "FOUND" | "NOT_FOUND" | "UNREADABLE" | "INVALID_FORMAT";

interface CheckDetails {
  [key: string]: string | number | boolean | null;
}

interface IntegrationCheck {
  code: string;
  status: CheckStatus;
  category: CheckCategory;
  details?: CheckDetails;
}

interface IntegrationDocument {
  document_id: string;
  document_index: number;
  document_type_code: DocumentTypeCode;
  pages: number;
  data: Record<string, unknown>;
  checks: IntegrationCheck[];
}

interface ExpedienteChecks {
  code: string;
  status: CheckStatus;
  category: CheckCategory;
  details?: CheckDetails;
}

interface IntegrationExpediente {
  schema_version: string;
  processed_at: string;
  expediente_id: string;
  document_count: number;
  documents: IntegrationDocument[];
  expediente_checks: ExpedienteChecks[];
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function mapDocumentTypeToCode(type: string): DocumentTypeCode {
  const typeMap: Record<string, DocumentTypeCode> = {
    "DNI": "DNI",
    "Nómina": "PAYSLIP",
    "Nomina": "PAYSLIP",
    "IRPF (Modelo 100)": "IRPF_100",
    "Vida Laboral": "WORK_LIFE",
    "Nota Simple": "LAND_REGISTRY_NOTE",
    "Contrato de Trabajo": "WORK_CONTRACT",
  };
  return typeMap[type] || "UNKNOWN";
}

function mapCheckCategory(checkId: string): CheckCategory {
  if (checkId.startsWith("DNI") || checkId.startsWith("ID")) return "IDENTITY";
  if (checkId.startsWith("FEC") || checkId.startsWith("VIG") || checkId.startsWith("ANT")) return "RECENCY";
  if (checkId.startsWith("IMP") || checkId.startsWith("SAL") || checkId.startsWith("ING") || checkId.startsWith("RET")) return "AMOUNTS";
  if (checkId.startsWith("EMP") || checkId.startsWith("COH") || checkId.startsWith("DOC")) return "CONSISTENCY";
  if (checkId.startsWith("COMP") || checkId.startsWith("REQ")) return "COMPLETENESS";
  return "FORMAT";
}

function parseAmount(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[€$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value: string | undefined | null): string | null {
  if (!value || value === "N/D" || value === "No encontrado") return null;
  
  // Try DD/MM/YYYY format
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  
  // Try YYYY-MM-DD format (already ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  
  return null;
}

function parsePercentage(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/%/g, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num / 100;
}

function normalizeFieldKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getFieldStatus(value: string | undefined | null): FieldStatus {
  if (value === null || value === undefined) return "NOT_FOUND";
  if (value === "N/D" || value === "No encontrado" || value === "") return "NOT_FOUND";
  if (value === "Ilegible") return "UNREADABLE";
  return "FOUND";
}

// ============================================================
// DOCUMENT DATA TRANSFORMERS
// ============================================================

function transformPayslipData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const get = (key: string) => extractedData[key]?.value;
  
  const data: Record<string, unknown> = {
    full_name: get("Nombre") || null,
    full_name_status: getFieldStatus(get("Nombre")),
    dni_nif: get("DNI/NIF") || null,
    dni_nif_status: getFieldStatus(get("DNI/NIF")),
    employer_name: get("Empresa") || null,
    employer_name_status: getFieldStatus(get("Empresa")),
    employer_cif: get("CIF Empresa") || null,
    employer_cif_status: getFieldStatus(get("CIF Empresa")),
    employment_start_date: parseDate(get("Fecha antigüedad")),
    employment_start_date_status: getFieldStatus(get("Fecha antigüedad")),
  };

  // Period
  const periodStr = get("Periodo");
  if (periodStr) {
    const periodMatch = periodStr.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–a]\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (periodMatch) {
      data.period = {
        start_date: parseDate(periodMatch[1]),
        end_date: parseDate(periodMatch[2]),
      };
    } else {
      data.period = { raw: periodStr };
    }
  }

  // Earnings
  const earnings: Array<{ concept: string; kind: string; amount_eur: number | null; amount_cents: number | null }> = [];
  
  const salarioBase = parseAmount(get("Salario Base"));
  if (salarioBase !== null) {
    earnings.push({
      concept: "Salario Base",
      kind: "BASE",
      amount_eur: salarioBase,
      amount_cents: Math.round(salarioBase * 100),
    });
  }

  const prorrateo = parseAmount(get("Prorrateo Pagas Extras"));
  if (prorrateo !== null) {
    earnings.push({
      concept: "Prorrateo Pagas Extras",
      kind: "PRORATE",
      amount_eur: prorrateo,
      amount_cents: Math.round(prorrateo * 100),
    });
  }

  const complementos = parseAmount(get("Complementos"));
  if (complementos !== null) {
    earnings.push({
      concept: "Complementos",
      kind: "SUPPLEMENT",
      amount_eur: complementos,
      amount_cents: Math.round(complementos * 100),
    });
  }

  data.earnings = earnings;
  data.earnings_total_eur = parseAmount(get("Total Devengado"));
  data.earnings_total_cents = data.earnings_total_eur ? Math.round((data.earnings_total_eur as number) * 100) : null;

  // Deductions
  const deductions: Array<{ concept: string; rate?: number | null; amount_eur: number | null }> = [];

  const irpfRate = parsePercentage(get("IRPF (%)"));
  const irpfAmount = parseAmount(get("IRPF (Importe)"));
  if (irpfAmount !== null) {
    deductions.push({
      concept: "IRPF",
      rate: irpfRate,
      amount_eur: irpfAmount,
    });
  }

  const ssWorker = parseAmount(get("Seguridad Social (Trabajador)"));
  if (ssWorker !== null) {
    deductions.push({
      concept: "Seguridad Social Trabajador",
      amount_eur: ssWorker,
    });
  }

  data.deductions = deductions;
  data.deductions_total_eur = parseAmount(get("Total Deducciones"));
  data.deductions_total_cents = data.deductions_total_eur ? Math.round((data.deductions_total_eur as number) * 100) : null;

  // Net
  data.net_total_eur = parseAmount(get("Líquido a Percibir"));
  data.net_total_cents = data.net_total_eur ? Math.round((data.net_total_eur as number) * 100) : null;

  return data;
}

function transformWorkLifeData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const get = (key: string) => extractedData[key]?.value;

  const data: Record<string, unknown> = {
    full_name: get("Nombre") || null,
    full_name_status: getFieldStatus(get("Nombre")),
    dni_nif: get("DNI/NIF") || null,
    dni_nif_status: getFieldStatus(get("DNI/NIF")),
    report_date: parseDate(get("Fecha del informe")),
    report_date_status: getFieldStatus(get("Fecha del informe")),
    total_days_contributed: parseInt(get("Total días en alta") || "0") || null,
  };

  // Situations array
  const situations: Array<Record<string, unknown>> = [];
  const empresaActual = get("Empresa actual");
  const fechaAlta = get("Fecha de alta");
  const diasEmpresa = get("Días en empresa actual");

  if (empresaActual || fechaAlta) {
    situations.push({
      employer_name: empresaActual || null,
      start_date: parseDate(fechaAlta),
      end_date: null,
      days_contributed: parseInt(diasEmpresa || "0") || null,
      is_current: true,
    });
  }

  data.situations = situations;

  return data;
}

function transformIRPFData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const get = (key: string) => extractedData[key]?.value;

  return {
    full_name: get("Nombre Declarante") || null,
    full_name_status: getFieldStatus(get("Nombre Declarante")),
    dni_nif: get("DNI/NIF") || null,
    dni_nif_status: getFieldStatus(get("DNI/NIF")),
    fiscal_year: parseInt(get("Ejercicio Fiscal") || "0") || null,
    work_income_eur: parseAmount(get("Rendimiento del trabajo")),
    work_income_cents: parseAmount(get("Rendimiento del trabajo")) ? Math.round(parseAmount(get("Rendimiento del trabajo"))! * 100) : null,
    taxable_base_eur: parseAmount(get("Base imponible")),
    tax_result_eur: parseAmount(get("Resultado declaración")),
    submission_date: parseDate(get("Fecha presentación")),
  };
}

function transformLandRegistryData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const get = (key: string) => extractedData[key]?.value;

  const data: Record<string, unknown> = {
    property_type: get("Tipo de inmueble") || null,
    address: get("Dirección") || null,
    municipality: get("Localidad/Municipio") || null,
    registry_reference: get("Referencia registral") || null,
    cadastral_reference: get("Referencia catastral") || null,
    surface_m2: parseAmount(get("Superficie")),
    has_encumbrances: get("¿Tiene cargas?") === "Sí" || get("¿Tiene cargas?") === "Si" ? true : get("¿Tiene cargas?") === "No" ? false : null,
    encumbrance_details: get("Detalle cargas") || null,
    issue_date: parseDate(get("Fecha expedición")),
  };

  // Ownerships array
  const ownerships: Array<Record<string, unknown>> = [];
  const titularNombre = get("Nombre titular");
  const titularDNI = get("DNI/NIF titular");
  const tipoDerecho = get("Tipo de derecho");
  const porcentaje = get("Porcentaje titularidad");

  if (titularNombre) {
    const shareValue = parsePercentage(porcentaje);
    ownerships.push({
      owner_name: titularNombre,
      owner_dni_nif: titularDNI || null,
      right_type: tipoDerecho || "PLENO_DOMINIO",
      share_raw: porcentaje || null,
      share_value: shareValue,
    });
  }

  data.ownerships = ownerships;

  return data;
}

function transformDNIData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const get = (key: string) => extractedData[key]?.value;

  return {
    full_name: get("Nombre") || null,
    full_name_status: getFieldStatus(get("Nombre")),
    dni_nif: get("DNI/NIF") || get("Número") || null,
    dni_nif_status: getFieldStatus(get("DNI/NIF") || get("Número")),
    birth_date: parseDate(get("Fecha nacimiento")),
    expiry_date: parseDate(get("Fecha caducidad")),
    nationality: get("Nacionalidad") || null,
  };
}

function transformContractData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const get = (key: string) => extractedData[key]?.value;

  return {
    full_name: get("Nombre") || null,
    full_name_status: getFieldStatus(get("Nombre")),
    dni_nif: get("DNI/NIF") || null,
    dni_nif_status: getFieldStatus(get("DNI/NIF")),
    employer_name: get("Empresa") || null,
    employer_cif: get("CIF Empresa") || null,
    contract_type: get("Tipo de contrato") || null,
    start_date: parseDate(get("Fecha inicio")),
    end_date: parseDate(get("Fecha fin")),
    work_category: get("Categoría profesional") || null,
    work_center: get("Centro de trabajo") || null,
    annual_salary_eur: parseAmount(get("Salario anual")),
    workday_type: get("Tipo de jornada") || null,
  };
}

function transformGenericData(extractedData: Record<string, { value: string }>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  
  for (const [key, field] of Object.entries(extractedData)) {
    const normalizedKey = normalizeFieldKey(key);
    const value = field.value;
    
    // Try to parse as amount
    if (value && (value.includes('€') || /^\d+[.,]\d{2}$/.test(value.replace(/\./g, '')))) {
      data[normalizedKey] = parseAmount(value);
      data[`${normalizedKey}_raw`] = value;
    }
    // Try to parse as date
    else if (value && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      data[normalizedKey] = parseDate(value);
      data[`${normalizedKey}_raw`] = value;
    }
    // Keep as string
    else {
      data[normalizedKey] = value || null;
      data[`${normalizedKey}_status`] = getFieldStatus(value);
    }
  }
  
  return data;
}

// ============================================================
// CHECK TRANSFORMERS
// ============================================================

function transformChecks(revisiones: Array<{ id: string; titulo: string; severidad: string; mensaje: string; detalle?: Array<{ label: string; value: string }> }>): IntegrationCheck[] {
  return revisiones.map(rev => {
    const details: CheckDetails = {};
    
    if (rev.detalle) {
      for (const item of rev.detalle) {
        const key = normalizeFieldKey(item.label);
        
        // Try to parse numeric values
        const numValue = parseAmount(item.value);
        if (numValue !== null && !item.value.includes('/')) {
          details[key] = numValue;
        }
        // Try to parse dates
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(item.value)) {
          details[key] = parseDate(item.value);
        }
        // Try to parse percentages
        else if (item.value.includes('%')) {
          details[key] = parsePercentage(item.value);
          details[`${key}_raw`] = item.value;
        }
        // Boolean-like values
        else if (item.value.toLowerCase() === 'sí' || item.value.toLowerCase() === 'si') {
          details[key] = true;
        }
        else if (item.value.toLowerCase() === 'no') {
          details[key] = false;
        }
        // Keep as string
        else {
          details[key] = item.value;
        }
      }
    }
    
    return {
      code: rev.id,
      status: rev.severidad as CheckStatus,
      category: mapCheckCategory(rev.id),
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  });
}

// ============================================================
// MAIN EXPORT FUNCTION
// ============================================================

export function prepareIntegrationExport(
  pages: Page[],
  documents: Document[]
): IntegrationExpediente {
  // Run cotejos interdocumentales
  const cotejos = runCotejosInterdocumentales(documents);
  
  // Transform documents
  const integrationDocuments: IntegrationDocument[] = documents.map((doc, index) => {
    const docPages = pages.filter(p => doc.pageIds.includes(p.id));
    const typeCode = mapDocumentTypeToCode(doc.documentType?.type || "");
    
    // Transform data based on document type
    let data: Record<string, unknown> = {};
    if (doc.extractedData) {
      switch (typeCode) {
        case "PAYSLIP":
          data = transformPayslipData(doc.extractedData);
          break;
        case "WORK_LIFE":
          data = transformWorkLifeData(doc.extractedData);
          break;
        case "IRPF_100":
          data = transformIRPFData(doc.extractedData);
          break;
        case "LAND_REGISTRY_NOTE":
          data = transformLandRegistryData(doc.extractedData);
          break;
        case "DNI":
          data = transformDNIData(doc.extractedData);
          break;
        case "WORK_CONTRACT":
          data = transformContractData(doc.extractedData);
          break;
        default:
          data = transformGenericData(doc.extractedData);
      }
    }
    
    // Transform checks
    const checks = doc.revisiones ? transformChecks(doc.revisiones) : [];
    
    return {
      document_id: doc.id,
      document_index: index + 1,
      document_type_code: typeCode,
      pages: docPages.length,
      data,
      checks,
    };
  });
  
  // Transform expediente checks (cotejos)
  const expedienteChecks: ExpedienteChecks[] = cotejos.map(cotejo => {
    const details: CheckDetails = {};
    
    // Add checklist items
    if (cotejo.checklist) {
      for (const item of cotejo.checklist) {
        const key = normalizeFieldKey(item.label);
        details[key] = item.checked;
      }
    }
    
    // Add detalle items
    if (cotejo.detalle) {
      for (const item of cotejo.detalle) {
        const key = normalizeFieldKey(item.label);
        
        // Try to parse numeric values
        const numValue = parseAmount(item.value);
        if (numValue !== null && !item.value.includes('/')) {
          details[key] = numValue;
        }
        // Try to parse percentages
        else if (item.value.includes('%')) {
          details[key] = parsePercentage(item.value);
        }
        // Boolean-like
        else if (item.value.toLowerCase() === 'sí' || item.value.toLowerCase() === 'si') {
          details[key] = true;
        }
        else if (item.value.toLowerCase() === 'no') {
          details[key] = false;
        }
        else {
          details[key] = item.value;
        }
      }
    }
    
    return {
      code: cotejo.id,
      status: cotejo.severidad as CheckStatus,
      category: mapCheckCategory(cotejo.id),
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  });
  
  // Generate timestamp with timezone
  const now = new Date();
  const tzOffset = -now.getTimezoneOffset();
  const tzHours = Math.floor(Math.abs(tzOffset) / 60);
  const tzMins = Math.abs(tzOffset) % 60;
  const tzSign = tzOffset >= 0 ? '+' : '-';
  const processedAt = now.toISOString().replace('Z', '') + 
    `${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMins).padStart(2, '0')}`;
  
  return {
    schema_version: "1.0",
    processed_at: processedAt,
    expediente_id: `EXP-${Date.now()}`,
    document_count: documents.length,
    documents: integrationDocuments,
    expediente_checks: expedienteChecks,
  };
}

// ============================================================
// DOWNLOAD FUNCTION
// ============================================================

export function downloadIntegrationJSON(pages: Page[], documents: Document[]) {
  const data = prepareIntegrationExport(pages, documents);
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

// Legacy exports for backward compatibility
export function downloadDocumentJSON(doc: { documentId: string; type: string; pageNumbers: number[]; fields: Record<string, string> }, index: number) {
  const jsonString = JSON.stringify({ documents: [doc] }, null, 2);
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

export function downloadDocumentCSV(doc: { documentId: string; type: string; pageNumbers: number[]; fields: Record<string, string> }, index: number) {
  const rows: string[][] = [['Campo', 'Valor']];
  
  if (doc.fields) {
    Object.entries(doc.fields).forEach(([key, value]) => {
      rows.push([key, String(value)]);
    });
  }

  const BOM = '\uFEFF';
  const csvString = rows.map(row => row.join(';')).join('\n');
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
