import { type NextRequest, NextResponse } from "next/server"
import { retryWithBackoff } from "@/lib/api-retry"

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

interface ExtractResponse {
  extraction: {
    segments?: Array<{ start_page: number; end_page: number }>
    rationale?: string
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
      throw new Error(`Extract API failed: ${res.status} ${res.statusText}`)
    }

    return res
  })

  return await response.json()
}

export async function POST(request: NextRequest) {
  try {
    const { markdowns } = await request.json()

    if (!markdowns || !Array.isArray(markdowns)) {
      return NextResponse.json({ error: "markdowns array is required" }, { status: 400 })
    }

    console.log("[v0] API: Batch segmentation for", markdowns.length, "pages")
    console.log("[v0] API: VISION_AGENT_API_KEY present for segmentation:", !!LANDING_API_KEY)

    // Join all markdowns with page headers
    let combinedMarkdown = ""
    for (let i = 0; i < markdowns.length; i++) {
      combinedMarkdown += `# Página ${i + 1}\n\n${markdowns[i]}\n\n---\n\n`
    }

    // Schema for batch segmentation
    const schema = JSON.stringify({
      properties: {
        segments: {
          description: `Eres un experto en segmentación documental. Recibirás un Markdown con ${markdowns.length} páginas etiquetadas como "# Página 1", "# Página 2", etc. 

Tu tarea es dividir estas páginas en documentos: cada documento es un conjunto de páginas consecutivas que pertenecen a la misma entidad y forman una unidad completa.

Devuelve una lista de segmentos, donde cada segmento representa un documento con start_page y end_page (numeración de 1 a ${markdowns.length}).

Criterios de segmentación:
- Tipología documental: páginas del mismo tipo (DNI, nómina, factura, etc.) suelen pertenecer al mismo documento
- Continuidad semántica: el final de una página enlaza con el inicio de la siguiente
- Coherencia visual: mismo formato, estructura o entidad emisora
- Referencias cruzadas: números de página, continuación de tablas, etc.

Ejemplos:
- Si páginas 1-3 son una factura completa y 4-5 son un contrato: [{"start_page": 1, "end_page": 3}, {"start_page": 4, "end_page": 5}]
- Si todas las páginas forman un único documento: [{"start_page": 1, "end_page": ${markdowns.length}}]
- Si cada página es un documento diferente: [{"start_page": 1, "end_page": 1}, {"start_page": 2, "end_page": 2}, ...]`,
          items: {
            properties: {
              start_page: {
                description: "Número de página donde inicia el documento (1-indexed)",
                type: "integer",
                minimum: 1,
                maximum: markdowns.length,
              },
              end_page: {
                description: "Número de página donde termina el documento (1-indexed)",
                type: "integer",
                minimum: 1,
                maximum: markdowns.length,
              },
            },
            required: ["start_page", "end_page"],
            type: "object",
          },
          title: "Document Segments",
          type: "array",
        },
        rationale: {
          description: "Breve explicación de cómo se hizo la segmentación",
          type: "string",
        },
      },
      required: ["segments"],
      title: "DocumentSegmentation",
      type: "object",
    })

    const extractResult = await apiExtract(combinedMarkdown, schema)

    console.log("[v0] API: Segmentation result:", extractResult)

    const segments = extractResult.extraction?.segments || []

    // Validate and fix segments
    const validSegments = segments.filter((seg) => {
      return seg.start_page >= 1 && seg.end_page >= seg.start_page && seg.end_page <= markdowns.length
    })

    // If no valid segments, assume all pages are one document
    if (validSegments.length === 0) {
      validSegments.push({ start_page: 1, end_page: markdowns.length })
    }

    console.log("[v0] API: Final segments:", validSegments)

    return NextResponse.json({ segments: validSegments })
  } catch (error) {
    console.error("[v0] API: Error in batch segmentation:", error)

    return NextResponse.json(
      {
        error: "Failed to segment documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
