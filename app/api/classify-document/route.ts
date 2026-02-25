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
      description: `Clasifica el documento EXCLUSIVAMENTE en una de estas categorias:
- "albaran" si el documento contiene la palabra ALBARAN o "Albaran" o "ALBARAN N" en el titulo/encabezado. Es un documento de entrega de mercancias con productos, cantidades, precios e importe. Puede tener desglose fiscal (base imponible + IVA + total albaran). La clave es que dice ALBARAN en el encabezado y tiene TOTAL ALBARAN (no TOTAL FACTURA).
- "factura_proveedor" si el documento contiene la palabra FACTURA en el titulo/encabezado, con numero de factura, fecha factura, CIF/NIF emisor, base imponible, desglose de IVA y TOTAL FACTURA.
- "convenio" si el documento contiene simultaneamente: palabras como "Convenio", "Convenio de colaboracion", "Acuerdo de colaboracion", "Las partes", "Manifiestan", "Clausulas", "Estipulaciones". Tiene identificacion formal de al menos dos partes, clausulas numeradas (PRIMERA, SEGUNDA, etc.), bloque final de firma, y estructura juridica formal (Exponen / Manifiestan / Clausulas / Firma). NO clasificar como convenio si es factura, albaran, contrato mercantil de prestacion de servicios, o resolucion administrativa unilateral.
- "recibi" si el documento contiene senales como "Recibi", "He recibido de", "Firmado recibi", "Total a percibir", "Retencion IRPF", "Honorarios". Documento simple de 1 pagina con tabla de concepto/importe/retencion IRPF/total a percibir, firma manuscrita final, y ausencia de desglose formal de IVA. NO clasificar como factura si solo existe retencion IRPF sin bloque formal de base imponible + IVA + total.
- "otros" si no encaja en ninguna de las categorias anteriores (condiciones de venta, anexos, documentos genericos, etc.).

REGLA CLAVE: Busca las palabras ALBARAN o FACTURA o CONVENIO o RECIBI en el encabezado del documento. Si dice "ALBARAN N" es albaran. Si dice "FACTURA" o "N Factura" es factura. Si dice "Convenio" con clausulas y partes firmantes es convenio. Si dice "Recibi" o tiene estructura de honorarios con retencion IRPF sin IVA es recibi. Las condiciones de venta o paginas sin datos tabulares son "otros".`,
      type: "string",
      enum: ["albaran", "factura_proveedor", "convenio", "recibi", "otros"],
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

    const displayType = tipo === "albaran" ? "Albaran" : tipo === "factura_proveedor" ? "Factura Proveedor" : tipo === "convenio" ? "Convenio" : tipo === "recibi" ? "Recibi" : "Otros"

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
