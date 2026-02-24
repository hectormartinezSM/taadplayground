import { type NextRequest, NextResponse } from "next/server"
import { retryWithBackoff } from "@/lib/api-retry"

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

interface ExtractResponse {
  extraction: {
    tipo_documento?: string
    confianza?: number
    razon?: string
  }
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse> {
  const formData = new FormData()
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "documento.md")
  formData.append("schema", schema)
  formData.append("model", "extract-latest")

  const response = await retryWithBackoff(async () => {
    const res = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LANDING_API_KEY}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      if (res.status === 429 || errorText.includes("Too Many")) {
        throw new Error(`Rate limit: ${res.status} - ${errorText}`)
      }
      throw new Error(`Extract API failed: ${res.status} ${res.statusText} - ${errorText}`)
    }

    return res
  })

  return await response.json()
}

const CLASSIFICATION_SCHEMA = JSON.stringify({
  properties: {
    tipo_documento: {
      description: `Clasifica el documento EXCLUSIVAMENTE en una de estas dos categorias:
- "albaran" si el documento es un albaran, nota de entrega, delivery note, o documento de entrega. Contiene productos/cantidades pero NO tiene estructura fiscal completa (base imponible + desglose IVA + total estructurado).
- "factura_proveedor" si el documento es una factura, invoice, con base imponible, desglose de IVA, total factura y CIF/NIF emisor.

ORDEN DE EVALUACION OBLIGATORIO: Primero evalua si es un ALBARAN. Solo si NO es albaran, evalua si es factura proveedor.
REGLA CLAVE: Si el documento tiene estructura fiscal completa (base + IVA + total), es factura_proveedor. Si tiene productos/cantidades pero sin estructura fiscal completa, es albaran.`,
      type: "string",
      enum: ["albaran", "factura_proveedor"],
    },
    confianza: {
      description: "Nivel de confianza en la clasificacion, de 0 a 1",
      type: "number",
    },
    razon: {
      description: "Breve justificacion de la clasificacion en 1-2 frases",
      type: "string",
    },
  },
  required: ["tipo_documento", "confianza", "razon"],
  title: "ClasificacionDocumental",
  type: "object",
})

export async function POST(request: NextRequest) {
  try {
    const { markdown } = await request.json()

    if (!markdown) {
      return NextResponse.json({ error: "Markdown content is required for classification" }, { status: 400 })
    }

    console.log("[v0] API: Classifying document with Landing AI, markdown length:", markdown.length)

    const result = await apiExtract(markdown, CLASSIFICATION_SCHEMA)

    console.log("[v0] API: Classification result:", JSON.stringify(result.extraction))

    const tipo = result.extraction?.tipo_documento || "factura_proveedor"
    const confianza = result.extraction?.confianza || 0.5
    const razon = result.extraction?.razon || ""

    const displayType = tipo === "albaran" ? "Albaran" : "Factura Proveedor"

    console.log("[v0] API: Document classified as:", displayType, "confianza:", confianza)

    return NextResponse.json({
      type: displayType,
      internalType: tipo,
      confidence: confianza,
      razon,
      markdown,
    })
  } catch (error) {
    console.error("[v0] API: Error classifying document:", error)

    return NextResponse.json(
      {
        error: "Failed to classify document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
