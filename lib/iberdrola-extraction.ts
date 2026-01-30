import type { IberdrolaCAEData, IberdrolaExtractionResult, IberdrolaExtractionRequest } from "./types"

/**
 * Extract Iberdrola CAE document fields from page text
 * 
 * @param pageText - The extracted text content from a PDF page
 * @param pageNumber - Optional page number for tracking
 * @param documentType - Optional document type identifier
 * @returns Extraction result with data, confidence, and warnings
 */
export async function extractIberdrolaFields(
  pageText: string,
  pageNumber?: number,
  documentType?: string
): Promise<IberdrolaExtractionResult> {
  const request: IberdrolaExtractionRequest = {
    pageText,
    pageNumber,
    documentType,
  }

  const response = await fetch("/api/extract-iberdrola-fields", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || "Extraction failed")
  }

  return response.json()
}

/**
 * Get the API schema documentation
 * @returns API documentation with example output and field descriptions
 */
export async function getExtractionSchema(): Promise<{
  description: string
  endpoint: string
  requestBody: Record<string, string>
  responseSchema: Record<string, unknown>
  exampleOutput: IberdrolaCAEData
  fieldDescriptions: Record<string, string>
}> {
  const response = await fetch("/api/extract-iberdrola-fields")
  
  if (!response.ok) {
    throw new Error("Failed to fetch extraction schema")
  }

  return response.json()
}

/**
 * Validate extracted data completeness
 * @param data - The extracted Iberdrola CAE data
 * @returns Object with validation status and missing fields
 */
export function validateExtraction(data: IberdrolaCAEData): {
  isComplete: boolean
  missingFields: string[]
  filledFields: string[]
} {
  const requiredFields = [
    "Nombre Cliente",
    "Apellidos Cliente", 
    "NIF Cliente",
    "Dirección",
    "Referencia Catastral",
    "Coordenadas X",
    "Coordenadas Y",
    "Existe Valor €/kWh",
    "Firma Cliente",
    "Firma Iberdrola",
  ] as const

  const missingFields: string[] = []
  const filledFields: string[] = []

  for (const field of requiredFields) {
    if (data[field] === null || data[field] === undefined) {
      missingFields.push(field)
    } else {
      filledFields.push(field)
    }
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    filledFields,
  }
}

/**
 * Format extracted data for display
 * @param data - The extracted Iberdrola CAE data
 * @returns Formatted data with display-friendly values
 */
export function formatExtractionForDisplay(data: IberdrolaCAEData): Record<string, string> {
  return {
    "Nombre Cliente": data["Nombre Cliente"] ?? "—",
    "Apellidos Cliente": data["Apellidos Cliente"] ?? "—",
    "NIF Cliente": data["NIF Cliente"] ?? "—",
    "Dirección": data["Dirección"] ?? "—",
    "Referencia Catastral": data["Referencia Catastral"] ?? "—",
    "Coordenadas": data["Coordenadas X"] !== null && data["Coordenadas Y"] !== null
      ? `(${data["Coordenadas X"]}, ${data["Coordenadas Y"]})`
      : "—",
    "Existe Valor €/kWh": data["Existe Valor €/kWh"] ?? "—",
    "Firma Cliente": data["Firma Cliente"] ?? "—",
    "Firma Iberdrola": data["Firma Iberdrola"] ?? "—",
  }
}
