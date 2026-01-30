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

export interface Document {
  id: string
  pageIds: string[]
  status: "creating" | "classifying" | "extracting" | "complete"
  documentType?: DocumentType
  fields?: Field[]
  extractedData?: Record<string, ExtractedField>
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

// Iberdrola CAE Document Extraction Types
export interface IberdrolaCAEData {
  "Nombre Cliente": string | null
  "Apellidos Cliente": string | null
  "NIF Cliente": string | null
  "Dirección": string | null
  "Referencia Catastral": string | null
  "Coordenadas X": number | null
  "Coordenadas Y": number | null
  "Existe Valor €/kWh": "Sí" | "No" | null
  "Firma Cliente": "Sí" | "No" | null
  "Firma Iberdrola": "Sí" | "No" | null
}

export interface IberdrolaExtractionResult {
  success: boolean
  extraction: {
    data: IberdrolaCAEData
    confidence: number
    warnings: string[]
  }
  pageNumber: number | null
  documentType: string
}

export interface IberdrolaExtractionRequest {
  pageText: string
  pageNumber?: number
  documentType?: string
}
