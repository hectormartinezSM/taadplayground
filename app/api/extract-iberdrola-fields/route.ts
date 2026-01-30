import { generateObject } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { z } from "zod"

// Schema for Iberdrola CAE document extraction
const IberdrolaCAESchema = z.object({
  "Nombre Cliente": z.string().nullable().describe("First name of the client"),
  "Apellidos Cliente": z.string().nullable().describe("Last name(s) of the client"),
  "NIF Cliente": z.string().nullable().describe("Tax identification number (NIF) of the client"),
  "Dirección": z.string().nullable().describe("Full address of the client including street, number, floor, postal code and city"),
  "Referencia Catastral": z.string().nullable().describe("Cadastral reference number of the property"),
  "Coordenadas X": z.number().nullable().describe("X coordinate (UTM) of the property location"),
  "Coordenadas Y": z.number().nullable().describe("Y coordinate (UTM) of the property location"),
  "Existe Valor €/kWh": z.enum(["Sí", "No"]).nullable().describe("Whether a €/kWh value exists - 'Sí' if marked with S, 'No' if marked with N or empty"),
  "Firma Cliente": z.enum(["Sí", "No"]).nullable().describe("Whether the client signature is present - 'Sí' if marked with S, 'No' if marked with N or empty"),
  "Firma Iberdrola": z.enum(["Sí", "No"]).nullable().describe("Whether the Iberdrola signature is present - 'Sí' if marked with S, 'No' if marked with N or empty"),
})

export type IberdrolaCAEData = z.infer<typeof IberdrolaCAESchema>

// Extended schema with metadata
const ExtractionResultSchema = z.object({
  data: IberdrolaCAESchema,
  confidence: z.number().min(0).max(1).describe("Overall confidence score of the extraction (0-1)"),
  warnings: z.array(z.string()).describe("List of any issues or uncertainties encountered during extraction"),
})

export async function POST(request: Request) {
  try {
    const { pageText, pageNumber, documentType } = await request.json()

    if (!pageText || typeof pageText !== "string") {
      return Response.json(
        { error: "pageText is required and must be a string" },
        { status: 400 }
      )
    }

    const systemPrompt = `You are an expert document data extractor specialized in Spanish energy sector documents, specifically Iberdrola CAE (Certificado de Ahorro Energético) agreements.

Your task is to extract specific fields from the provided document text. Follow these rules strictly:

1. COORDINATES: Extract X and Y coordinates separately as numbers. They are typically in UTM format like "(408381.490, 4535856.403)" - extract 408381.490 as X and 4535856.403 as Y.

2. BOOLEAN FIELDS: Convert indicators to "Sí" or "No":
   - If marked with "S", "Sí", "SI", "Yes", "X", or checked → return "Sí"
   - If marked with "N", "No", "NO", empty, or unchecked → return "No"
   - If unclear or not found → return null

3. MISSING FIELDS: If a field cannot be found or is illegible, return null for that field.

4. ADDRESS: Combine all address components (street type, name, number, floor, door, postal code, city) into a single string.

5. NIF: Spanish tax ID format is typically 8 digits followed by a letter (e.g., "03432147H").

6. CADASTRAL REFERENCE: A 20-character alphanumeric code identifying the property.

Be precise and only extract information that is clearly present in the text. Do not infer or guess values.`

    const userPrompt = `Extract the following fields from this Iberdrola CAE document (Page ${pageNumber || "unknown"}):

Document text:
"""
${pageText}
"""

Extract these fields:
- Nombre Cliente (first name)
- Apellidos Cliente (last name)
- NIF Cliente (tax ID)
- Dirección (full address)
- Referencia Catastral (cadastral reference)
- Coordenadas X (X coordinate as number)
- Coordenadas Y (Y coordinate as number)
- Existe Valor €/kWh (Sí/No)
- Firma Cliente (Sí/No)
- Firma Iberdrola (Sí/No)

Return the extracted data with a confidence score and any warnings about uncertain extractions.`

    const result = await generateObject({
      model: gateway("openai/gpt-4o-mini"),
      schema: ExtractionResultSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1, // Low temperature for more deterministic extraction
    })

    return Response.json({
      success: true,
      extraction: result.object,
      pageNumber: pageNumber || null,
      documentType: documentType || "Convenio CAE",
    })
  } catch (error) {
    console.error("Extraction error:", error)
    return Response.json(
      {
        error: "Failed to extract fields from document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// GET endpoint to return the expected schema structure
export async function GET() {
  const exampleOutput: IberdrolaCAEData = {
    "Nombre Cliente": "TOMAS",
    "Apellidos Cliente": "MIGUELAÑEZ MERINO",
    "NIF Cliente": "03432147H",
    "Dirección": "CL ASOMADILLA (LA) 2 BJ 1 40196 LASTRILLA (LA)",
    "Referencia Catastral": "8459024VL0385N0001KW",
    "Coordenadas X": 408381.490,
    "Coordenadas Y": 4535856.403,
    "Existe Valor €/kWh": "Sí",
    "Firma Cliente": "Sí",
    "Firma Iberdrola": "Sí",
  }

  return Response.json({
    description: "Iberdrola CAE Document Field Extraction API",
    endpoint: "POST /api/extract-iberdrola-fields",
    requestBody: {
      pageText: "string (required) - The extracted text from the PDF page",
      pageNumber: "number (optional) - The page number being processed",
      documentType: "string (optional) - Type of document being processed",
    },
    responseSchema: {
      success: "boolean",
      extraction: {
        data: "IberdrolaCAEData object with extracted fields",
        confidence: "number (0-1) - Overall extraction confidence",
        warnings: "string[] - List of extraction issues or uncertainties",
      },
      pageNumber: "number | null",
      documentType: "string",
    },
    exampleOutput,
    fieldDescriptions: {
      "Nombre Cliente": "First name of the client (string or null)",
      "Apellidos Cliente": "Last name(s) of the client (string or null)",
      "NIF Cliente": "Tax identification number - 8 digits + letter (string or null)",
      "Dirección": "Full address including street, postal code, city (string or null)",
      "Referencia Catastral": "20-character cadastral reference (string or null)",
      "Coordenadas X": "UTM X coordinate as decimal number (number or null)",
      "Coordenadas Y": "UTM Y coordinate as decimal number (number or null)",
      "Existe Valor €/kWh": "'Sí' or 'No' - whether €/kWh value exists",
      "Firma Cliente": "'Sí' or 'No' - whether client signature is present",
      "Firma Iberdrola": "'Sí' or 'No' - whether Iberdrola signature is present",
    },
  })
}
