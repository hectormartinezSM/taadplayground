import { type NextRequest, NextResponse } from "next/server"

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

interface ExtractResponse {
  extraction: Record<string, string>
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse | null> {
  const formData = new FormData()
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "document.md")
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
        description: `Extract the value of "${fieldName}" from a document of type "${documentType}".

Your goal is to return the requested fields as CONCISELY as possible: the shorter, more summarized and synthesized the answer, the better, without losing key information.

FORMAT RULES (MANDATORY):

1) Extreme brevity:
   - Each value must be as short as possible.
   - Target: <= 50 characters per field.
   - If you exceed 50, rewrite and shorten (remove redundant words, abbreviate the obvious).
   - Forbidden: complete sentences, explanations, filler phrases ("according to the document...", "it appears...").
   - Only the final data point. If missing: "N/A".

2) Person names:
   - Required format: "First Last"
   - If the document has "LAST, FIRST" or "LAST, First": invert to "First Last".
   - Normal capitalization: First letter uppercase and rest lowercase (preserving accents).
   - Remove commas from the final name.
   - Examples:
     - "SMITH, JOHN" -> "John Smith"
     - "DOE, JANE M." -> "Jane M. Doe"

3) Company names:
   - First letter UPPERCASE and rest lowercase.
   - Keep acronyms and legal forms in uppercase where applicable (e.g.: "Inc.", "LLC", "Ltd.", "Corp.", "GmbH", "S.A.").
   - Example:
     - "LIBERTY MUTUAL INSURANCE COMPANY" -> "Liberty Mutual Insurance Company"

4) Amounts:
   - Numeric format: use appropriate separators for the currency detected.
   - Add the currency symbol: "$1,234.56" or "1,234.56 EUR" or "£4.50"
   - If there is an additional unit, use symbolic format (e.g.: "%", "/month", "/day").
   - Examples:
     - "1234.5 USD" -> "$1,234.50"
     - "4.50 GBP" -> "£4.50"
     - "10 percent" -> "10%"

5) Dates:
   - Format: MM/DD/YYYY
   - If it's a range or period: MM/DD/YYYY - MM/DD/YYYY
   - Examples:
     - "2025-01-08" -> "01/08/2025"
     - "from January 1 to March 31, 2025" -> "01/01/2025 - 03/31/2025"
     - "01-01-76 TO 01-01-77" -> "01/01/1976 - 01/01/1977"`,
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
        for (const fieldName of fields) {
          result[fieldName] = {
            value: "N/A",
            confidence: 1,
          }
        }
      }
    } catch (error) {
      console.log("[v0] API: Error extracting fields -", error)
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
