import { type NextRequest, NextResponse } from "next/server"

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

interface ExtractResponse {
  extraction: Record<string, string>
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse | null> {
  const formData = new FormData()
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "documento.md")
  formData.append("schema", schema)
  formData.append("model", "extract-latest")

  try {
    const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LANDING_API_KEY}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.log("[v0] API: Field extraction failed -", response.status, errorBody)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("[v0] API: Field extraction error:", error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { markdown, fields, documentType } = await request.json()

    if (!markdown || !fields || !Array.isArray(fields) || !documentType) {
      return NextResponse.json({ error: "Markdown, fields array, and document type are required" }, { status: 400 })
    }

    console.log("[v0] API: Extracting", fields.length, "fields for document type:", documentType)

    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const fieldName of fields) {
      if (!fieldName) continue

      properties[fieldName] = {
        type: "string",
        description: `Extrae el valor de ${fieldName}\nTen en cuenta que el documento es ${documentType}\nExtrae solo el valor solicitado, responde simplemente eso. Traduce la respuesta al castellano a no ser que sean nombres propios. Intenta compactar la respuesta en un maximo de 10-20 palabras aunque siempre el minimo. Los importe ponlos siempre en formato numerico con separacion de miles por punto y de decimales con coma además añade la unidad al final si toca. Las fechas siempre en formato DD/MM/AAAA`,
      }
      required.push(fieldName)
    }

    const schema = JSON.stringify({
      type: "object",
      properties,
      required,
    })

    console.log("[v0] API: Extracting all fields in a single call")

    const result: Record<string, { value: string; confidence: number }> = {}

    try {
      const extractionResult = await apiExtract(markdown, schema)

      if (extractionResult && extractionResult.extraction) {
        // Map the extraction results to our format
        for (const fieldName of fields) {
          const valor = extractionResult.extraction[fieldName]

          if (valor && typeof valor === "string") {
            result[fieldName] = {
              value: valor.trim(),
              confidence: 1,
            }
            console.log("[v0] API: Field", fieldName, "extracted:", valor.trim())
          } else {
            result[fieldName] = {
              value: "N/A",
              confidence: 1,
            }
            console.log("[v0] API: No response for field:", fieldName)
          }
        }
      } else {
        console.log("[v0] API: No extraction results")
        // Set all fields to N/A
        for (const fieldName of fields) {
          result[fieldName] = {
            value: "N/A",
            confidence: 1,
          }
        }
      }
    } catch (error) {
      console.log("[v0] API: Error extracting fields -", error)
      // Set all fields to N/A on error
      for (const fieldName of fields) {
        result[fieldName] = {
          value: "N/A",
          confidence: 1,
        }
      }
    }

    console.log("[v0] API: All fields extracted successfully")

    return NextResponse.json({ extractedData: result })
  } catch (error) {
    console.error("[v0] API: Error extracting fields:", error)

    return NextResponse.json(
      {
        error: "Failed to extract fields",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
