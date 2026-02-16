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

    // Check document type for special field handling
    const isComprobante = documentType === 'Comprobante Bancario' || documentType.toLowerCase().includes('comprobante')
    const isDocumentoID = documentType === 'Documento Identificativo' || documentType.toLowerCase().includes('identificativo')

    for (const fieldName of fields) {
      if (!fieldName) continue

      // Special handling for Comprobante Bancario fields
      if (isComprobante && fieldName === 'Tipo de Crédito') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el tipo o nombre del producto de crédito/préstamo que aparece en el comprobante bancario (ej.: "Dinero Inmediato", "Préstamo Personal", "Crédito al Consumo").
Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isComprobante && fieldName === 'Institución') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el nombre del banco o entidad financiera que provee el crédito o préstamo.
Capitaliza correctamente: primera letra en mayúscula. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isComprobante && fieldName === 'Importe de la Cuota') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el importe de la cuota regular del préstamo/crédito.
Formato: XX.XXX,XX € (separador de miles: punto, separador decimal: coma, símbolo de moneda detrás).
Ejemplo: "1.234,56 €". Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isComprobante && fieldName === 'Cuotas Pendientes') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el número de cuotas pendientes de pago del préstamo/crédito.
Devuelve solo el número (ej.: "12", "36"). Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      // Special handling for Documento Identificativo fields
      if (isDocumentoID && fieldName === 'Apellidos') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae los apellidos de la persona del documento de identidad (DNI, NIE o Pasaporte).
Capitalización normal: primera letra en mayúscula, resto en minúsculas. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Nombre') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el nombre de pila de la persona del documento de identidad.
Capitalización normal: primera letra en mayúscula, resto en minúsculas. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Sexo') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el sexo de la persona del documento de identidad.
Devuelve "M" para masculino o "F" para femenino. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Nacionalidad') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae la nacionalidad de la persona del documento de identidad (ej.: "Española", "Colombiana").
Capitalización normal. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Fecha nacimiento') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae la fecha de nacimiento del documento de identidad.
Formato obligatorio: DD/MM/AAAA. Ejemplo: "15/03/1990". Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Estado Civil') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el estado civil de la persona del documento de identidad (ej.: "Soltero/a", "Casado/a", "Divorciado/a", "Viudo/a").
Si no se encuentra en el documento, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Lugar de nacimiento') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el lugar de nacimiento de la persona del documento de identidad.
Devuelve la localidad/ciudad de nacimiento. Capitalización normal. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Ciudad') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae la ciudad de domicilio/residencia de la persona del documento de identidad.
Capitalización normal. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Provincia') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae la provincia de domicilio/residencia de la persona del documento de identidad.
Capitalización normal. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Calle') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae la calle de domicilio/residencia de la persona del documento de identidad.
Incluye nombre de la vía y número. Capitalización normal. Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      if (isDocumentoID && fieldName === 'Número de apartamento') {
        properties[fieldName] = {
          type: "string",
          description: `Extrae el número de apartamento, piso, puerta o escalera del domicilio de la persona del documento de identidad (ej.: "3º B", "Piso 2, Puerta A").
Si no se encuentra, devuelve "N/D".`
        }
        required.push(fieldName)
        continue
      }

      // Generic fallback for any other field
      properties[fieldName] = {
        type: "string",
        description: `Extrae el valor de ${fieldName} del documento tipo ${documentType}.
Sé conciso: devuelve solo el dato, sin explicaciones. Máximo 50 caracteres.
Fechas: DD/MM/AAAA. Importes: XX.XXX,XX €. Si no se encuentra: "N/D".`,
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
