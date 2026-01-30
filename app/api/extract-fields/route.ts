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

    // Check if this is a Convenio CAE document for special field handling
    const isConvenioCAE = documentType === 'Convenio CAE' || 
      documentType.toLowerCase().includes('convenio cae') || 
      documentType.toLowerCase().includes('cae iberdrola')

    for (const fieldName of fields) {
      if (!fieldName) continue

      // Special handling for Convenio CAE coordinate fields - use string to preserve all decimal places
      if (isConvenioCAE && (fieldName === 'Coordenadas X' || fieldName === 'Coordenadas Y')) {
        properties[fieldName] = {
          type: "string",
          description: `Extrae la coordenada ${fieldName === 'Coordenadas X' ? 'X (primera)' : 'Y (segunda)'} del campo "Coordenadas" del documento.
Las coordenadas aparecen en formato (X, Y) como por ejemplo (408381.490, 4535856.403).
Devuelve SOLO el valor numérico correspondiente como texto, preservando TODOS los decimales exactamente como aparecen.
Si es Coordenadas X, devuelve el primer número. Si es Coordenadas Y, devuelve el segundo número.
IMPORTANTE: Preserva todos los dígitos incluyendo ceros finales. Ejemplo: "408381.490" NO "408381.49".`
        }
        required.push(fieldName)
        continue
      }

      // Special handling for Convenio CAE boolean fields (Sí/No)
      if (isConvenioCAE && ['Existe Valor €/kWh', 'Firma Cliente', 'Firma Iberdrola'].includes(fieldName)) {
        properties[fieldName] = {
          type: "string",
          enum: ["Sí", "No"],
          description: `Extrae el valor del campo "${fieldName}" del documento.
En el documento original aparece como "S" para Sí y "N" para No.
Devuelve "Sí" si el valor es "S" o indica afirmativo.
Devuelve "No" si el valor es "N" o indica negativo.
Si no encuentras el campo o no está claro, devuelve "No".`
        }
        required.push(fieldName)
        continue
      }

      properties[fieldName] = {
        type: "string",
        description: `Extrae el valor de ${fieldName} del documento tipo ${documentType}.

Tu objetivo es devolver los campos solicitados de forma MUY CONCISA: cuanto más breve, resumida y sintetizada sea la respuesta, mejor, sin perder información clave.

REGLAS DE FORMATO (OBLIGATORIAS):

1) Brevedad extrema:
   - Cada valor debe ser lo más corto posible.
   - Objetivo: <= 50 caracteres por campo.
   - Si te pasas de 50, reescribe y acorta (elimina palabras redundantes, abrevia lo obvio).
   - Prohibido: frases completas, explicaciones, coletillas ("según el documento…", "parece…").
   - Solo el dato final. Si falta: "N/D".

2) Nombres de personas:
   - Formato obligatorio: "Nombre Apellidos"
   - Si el documento trae "Apellidos, Nombre" o "APELLIDOS, NOMBRE": invierte a "Nombre Apellidos".
   - Capitalización normal: Primera letra en mayúscula y resto en minúsculas (respetando tildes).
   - Elimina comas en el nombre final.
   - Ejemplos:
     - "PÉREZ GARCÍA, JUAN" → "Juan Pérez García"
     - "GARCIA, ANA" → "Ana Garcia"
     - "Juan Pérez García" → "Juan Pérez García"

3) Nombres de empresas:
   - Primera letra en MAYÚSCULA y el resto en minúsculas.
   - Mantén siglas y formas societarias en mayúsculas cuando aplique (ej.: "S.A.", "S.L.", "S.L.U.", "U.T.E.", "B.V.", "GmbH").
   - Ejemplo:
     - "SERIMAG SOLUCIONES DIGITALES S.L." → "Serimag Soluciones Digitales S.L."

4) Importes:
   - Formato numérico: XX.XXX.XXX,XX
   - Separador de miles: punto (.)
   - Separador decimal: coma (,)
   - Añade el símbolo de moneda (preferentemente detrás si no se indica lo contrario): "1.234,56 €"
   - Si hay unidad adicional, usa formato simbólico (ej.: "%", "€/mes", "€/día", "u.").
   - Ejemplos:
     - "1234.5 EUR" → "1.234,50 €"
     - "10 percent" → "10 %"

5) Fechas:
   - Formato: DD/MM/AAAA
   - Si es un intervalo o periodo: DD/MM/AAAA - DD/MM/AAAA
   - Ejemplos:
     - "2025-01-08" → "08/01/2025"
     - "del 1 de enero al 31 de marzo de 2025" → "01/01/2025 - 31/03/2025"`,
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

          // Handle different value types (string, number, etc.)
          if (valor !== null && valor !== undefined && valor !== "") {
            // Convert numbers to string for display, preserve string values
            const valueStr = typeof valor === "number" ? valor.toString() : String(valor).trim()
            result[fieldName] = {
              value: valueStr,
              confidence: 1,
            }
            console.log("[v0] API: Field", fieldName, "extracted:", valueStr)
          } else {
            result[fieldName] = {
              value: "N/D",
              confidence: 1,
            }
            console.log("[v0] API: No response for field:", fieldName)
          }
        }
      } else {
        console.log("[v0] API: No extraction results")
        // Set all fields to N/D
        for (const fieldName of fields) {
          result[fieldName] = {
            value: "N/D",
            confidence: 1,
          }
        }
      }
    } catch (error) {
      console.log("[v0] API: Error extracting fields -", error)
      // Set all fields to N/D on error
      for (const fieldName of fields) {
        result[fieldName] = {
          value: "N/D",
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
