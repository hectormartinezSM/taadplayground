// Types for the document processing workflow

export type PageStatus = "processing" | "blank" | "included" | "discarded"

export interface Page {
  id: string
  index: number
  imageUrl: string
  status: PageStatus
  isBlank: boolean
  documentId?: string
}

export interface DocumentType {
  type: string
  confidence: number
}

export interface Field {
  name: string
}

export interface ExtractedField {
  value: string
  confidence: number
}

// DNI Validation Types
export type RevisionSeverity = "OK" | "WARNING" | "ERROR"

export interface DNIRevision {
  id: string
  titulo: string
  severidad: RevisionSeverity
  mensaje: string
}

export interface DNITechnicalData {
  // Datos del reverso
  dni_reverso: string
  fecha_nacimiento_reverso: string
  fecha_validez_reverso: string
  // MRZ
  mrz_linea_1: string
  mrz_linea_2: string
  mrz_numero_documento: string
  mrz_fecha_nacimiento: string
  mrz_fecha_expiracion: string
  mrz_checksum_numero: string
  mrz_checksum_nacimiento: string
  mrz_checksum_expiracion: string
}

// Nomina Validation Types (reuses RevisionSeverity and DNIRevision structure)
export interface NominaRevision {
  id: string
  titulo: string
  severidad: RevisionSeverity
  mensaje: string
}

export interface Document {
  id: string
  pageIds: string[]
  status: "creating" | "classifying" | "extracting" | "complete"
  documentType?: DocumentType
  fields?: Field[]
  extractedData?: Record<string, ExtractedField>
  // DNI specific
  dniTechnicalData?: DNITechnicalData
  // Revisiones (both DNI and Nomina use the same structure)
  revisiones?: (DNIRevision | NominaRevision)[]
}

export interface ActivityLogEntry {
  id: string
  timestamp: Date
  type: "page_discarded" | "document_created" | "document_classified" | "fields_detected" | "field_extracted"
  message: string
}

export type WorkflowStep =
  | "upload"
  | "splitting"
  | "blank_detection"
  | "segmentation"
  | "classification"
  | "extraction"
  | "complete"

export interface SegmentationProgress {
  phase: "segmentation"
  status: "running" | "done" | "error"
  pagesTotal: number
  pagesDone: number
  currentPage: number
  segmentStarts: number[] // pages that are start of subdocument
}

export interface SegmentationStatus {
  isSegmenting: boolean
  documentsGenerated: number
  processingDocuments: boolean
}
