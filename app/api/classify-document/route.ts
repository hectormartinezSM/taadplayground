import { type NextRequest, NextResponse } from "next/server"
import { parseCache } from "../check-blank/route"

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

interface ParseResponse {
  markdown: string
}

interface ExtractResponse {
  extraction: {
    Clasify?: string
  }
}

async function apiParse(imageBase64: string): Promise<string> {
  if (parseCache.has(imageBase64)) {
    console.log("[v0] API: Using cached parse result for classification")
    return parseCache.get(imageBase64)!
  }

  if (!LANDING_API_KEY) {
    throw new Error("VISION_AGENT_API_KEY environment variable is not configured")
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
  const buffer = Buffer.from(base64Data, "base64")

  const formData = new FormData()
  formData.append("document", new Blob([buffer]), "image.jpg")
  formData.append("model", "dpt-2-latest")

  const response = await fetch(`${API_BASE_URL}/v1/ade/parse`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text()

    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a few moments.")
    }

    throw new Error(`Parse API failed: ${response.status} - ${errorBody}`)
  }

  const contentType = response.headers.get("content-type")
  if (!contentType || !contentType.includes("application/json")) {
    const textBody = await response.text()
    throw new Error(`Unexpected response format: ${textBody.substring(0, 100)}`)
  }

  const data: ParseResponse = await response.json()

  parseCache.set(imageBase64, data.markdown)

  return data.markdown
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse> {
  const formData = new FormData()
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "documento.md")
  formData.append("schema", schema)
  formData.append("model", "extract-latest")

  const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text()

    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a few moments.")
    }

    throw new Error(`Extract API failed: ${response.status} - ${errorBody}`)
  }

  const contentType = response.headers.get("content-type")
  if (!contentType || !contentType.includes("application/json")) {
    const textBody = await response.text()
    throw new Error(`Unexpected response format: ${textBody.substring(0, 100)}`)
  }

  return await response.json()
}

function joinMarkdowns(markdowns: string[]): string {
  let finalText = ""

  for (let i = 0; i < markdowns.length; i++) {
    const newText = `# Página ${i + 1}\n\n${markdowns[i]}\n\n ---\n\n`
    finalText += newText
  }

  return finalText
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls } = await request.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: "Image URLs array is required" }, { status: 400 })
    }

    console.log("[v0] API: Classifying document with", imageUrls.length, "pages...")

    const markdowns: string[] = []
    for (const imageUrl of imageUrls) {
      const markdown = await apiParse(imageUrl)
      markdowns.push(markdown)
    }

    console.log("[v0] API: All pages parsed, joining markdowns...")

    const joinedMarkdown = joinMarkdowns(markdowns)
    const lowerMarkdown = joinedMarkdown.toLowerCase()

    // Fast keyword-based classification: Comprobante Bancario / Documento Identificativo / Otros
    const isComprobante =
      lowerMarkdown.includes('cuota') ||
      lowerMarkdown.includes('credito') ||
      lowerMarkdown.includes('crédito') ||
      lowerMarkdown.includes('prestamo') ||
      lowerMarkdown.includes('préstamo') ||
      lowerMarkdown.includes('saldo pendiente') ||
      lowerMarkdown.includes('cuotas pendientes') ||
      lowerMarkdown.includes('importe cuota') ||
      lowerMarkdown.includes('institución') ||
      lowerMarkdown.includes('institucion') ||
      (lowerMarkdown.includes('banco') && (lowerMarkdown.includes('cuota') || lowerMarkdown.includes('pendiente'))) ||
      lowerMarkdown.includes('número de cuenta') ||
      lowerMarkdown.includes('numero de cuenta')

    const isDocumentoID =
      lowerMarkdown.includes('dni') ||
      lowerMarkdown.includes('nie') ||
      lowerMarkdown.includes('pasaporte') ||
      lowerMarkdown.includes('passport') ||
      lowerMarkdown.includes('documento nacional') ||
      lowerMarkdown.includes('número de soporte') ||
      lowerMarkdown.includes('numero de soporte') ||
      lowerMarkdown.includes('fecha de nacimiento') ||
      lowerMarkdown.includes('nacionalidad') ||
      lowerMarkdown.includes('lugar de nacimiento') ||
      (lowerMarkdown.includes('sexo') && (lowerMarkdown.includes('apellido') || lowerMarkdown.includes('nombre')))

    if (isComprobante && !isDocumentoID) {
      console.log("[v0] API: Fast classification - Comprobante Bancario detected by keywords")
      return NextResponse.json({
        type: "Comprobante Bancario",
        confidence: 1,
        markdown: joinedMarkdown,
      })
    }

    if (isDocumentoID && !isComprobante) {
      console.log("[v0] API: Fast classification - Documento Identificativo detected by keywords")
      return NextResponse.json({
        type: "Documento Identificativo",
        confidence: 1,
        markdown: joinedMarkdown,
      })
    }

    // If both or neither matched, use AI extraction to decide
    const schemaClasificacion = JSON.stringify({
      properties: {
        Clasify: {
          anyOf: [{ type: "string" }, { type: "null" }],
          default: null,
          description: `INSTRUCCIONES DE CLASIFICACIÓN (OBLIGATORIAS)

Debes clasificar el documento en UNA de estas tres categorías EXACTAS:
- "Comprobante Bancario": Si el documento es una captura de pantalla o comprobante de una plataforma bancaria online mostrando detalles de un préstamo, crédito o cuotas de pago.
- "Documento Identificativo": Si el documento es un DNI, NIE, pasaporte o documento de identidad español.
- "Otros": Si el documento NO encaja en ninguna de las dos categorías anteriores.

Devuelve SOLO "Comprobante Bancario", "Documento Identificativo" o "Otros". Sin explicaciones, sin aclaraciones.`,
          title: "Clasify",
        },
      },
      title: "TipoDocumento",
      type: "object",
    })

    let classification = "Otros"

    try {
      console.log("[v0] API: Trying AI classification (Comprobante Bancario / Documento Identificativo / Otros)...")
      const result = await apiExtract(joinedMarkdown, schemaClasificacion)

      if (result.extraction && result.extraction.Clasify) {
        const aiResult = result.extraction.Clasify.trim().toLowerCase()
        if (aiResult.includes('comprobante')) {
          classification = 'Comprobante Bancario'
        } else if (aiResult.includes('identificativo') || aiResult.includes('dni') || aiResult.includes('pasaporte')) {
          classification = 'Documento Identificativo'
        } else {
          classification = 'Otros'
        }
      }
    } catch (error) {
      console.log("[v0] API: Classification failed, defaulting to Otros")
      classification = "Otros"
    }

    console.log("[v0] API: Document classified as:", classification)

    return NextResponse.json({
      type: classification,
      confidence: 1,
      markdown: joinedMarkdown,
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
