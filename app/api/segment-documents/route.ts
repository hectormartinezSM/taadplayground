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
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "document.md")
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

    // Join all markdowns with page headers
    let combinedMarkdown = ""
    for (let i = 0; i < markdowns.length; i++) {
      combinedMarkdown += `# Page ${i + 1}\n\n${markdowns[i]}\n\n---\n\n`
    }

    // Schema for batch segmentation
    const schema = JSON.stringify({
      properties: {
        segments: {
          description: `You are an expert in document segmentation. You will receive a Markdown with ${markdowns.length} pages labeled as "# Page 1", "# Page 2", etc.

Your task is to divide these pages into documents: each document is a set of consecutive pages that belong to the same entity and form a complete unit.

Return a list of segments, where each segment represents a document with start_page and end_page (numbering from 1 to ${markdowns.length}).

Segmentation criteria:
- Document typology: pages of the same type (invoice, receipt, lab report, contract, etc.) usually belong to the same document
- Semantic continuity: the end of one page links with the beginning of the next
- Visual coherence: same format, structure, or issuing entity
- Cross-references: page numbers, continuation of tables, etc.

Examples:
- If pages 1-3 are a complete invoice and 4-5 are a contract: [{"start_page": 1, "end_page": 3}, {"start_page": 4, "end_page": 5}]
- If all pages form a single document: [{"start_page": 1, "end_page": ${markdowns.length}}]
- If each page is a different document: [{"start_page": 1, "end_page": 1}, {"start_page": 2, "end_page": 2}, ...]`,
          items: {
            properties: {
              start_page: {
                description: "Page number where the document starts (1-indexed)",
                type: "integer",
                minimum: 1,
                maximum: markdowns.length,
              },
              end_page: {
                description: "Page number where the document ends (1-indexed)",
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
          description: "Brief explanation of how the segmentation was performed",
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
