import { type NextRequest, NextResponse } from "next/server"
import { retryWithBackoff } from "@/lib/api-retry"

// Allow large bodies (base64 images can be several MB)
export const maxDuration = 60

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

interface ParseResponse {
  markdown: string
}

interface ExtractResponse {
  extraction: {
    es_blanca?: boolean
    rationale?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }

    console.log("[v0] API: Starting combined parse + blank check")
    console.log("[v0] API: VISION_AGENT_API_KEY present:", !!LANDING_API_KEY, "length:", LANDING_API_KEY?.length || 0)
    console.log("[v0] API: imageUrl present:", !!imageUrl, "length:", imageUrl?.length || 0)

    // Step 1: Parse the image to markdown
    const markdown = await apiParse(imageUrl)
    console.log("[v0] API: Parse complete, markdown length:", markdown.length)

    // Step 2: Check if it's blank
    const trimmedMarkdown = markdown.trim()
    if (!trimmedMarkdown || trimmedMarkdown.length < 10) {
      console.log("[v0] API: Markdown too short - treating as blank")
      return NextResponse.json({
        success: true,
        markdown,
        isBlank: true,
      })
    }

    const schema = JSON.stringify({
      properties: {
        es_blanca: {
          description:
            "Devuele True si consideras que una pagina es blanca y False en caso contrarioEntendemos como página blanca una página sin información de ningun tipo, ni sellos, pies de pagina ni imagenes",
          title: "Es Blanca",
          type: "boolean",
        },
        rationale: {
          description: "Breve explicación de por qué",
          title: "Rationale",
          type: "string",
        },
      },
      required: ["es_blanca", "rationale"],
      title: "DetectorBlancas",
      type: "object",
    })

    const extractResult = await apiExtract(markdown, schema)

    if (extractResult === null) {
      console.log("[v0] API: Extract returned null - treating as blank")
      return NextResponse.json({
        success: true,
        markdown,
        isBlank: true,
      })
    }

    let isBlank = false

    if (extractResult.extraction && "es_blanca" in extractResult.extraction) {
      const esBlanca = extractResult.extraction.es_blanca
      const rationale = extractResult.extraction.rationale?.trim() || ""

      if (esBlanca === true) {
        isBlank = true
      } else if (esBlanca === null && rationale === "") {
        isBlank = true
      }
    }

    console.log("[v0] API: Blank check complete, isBlank:", isBlank)

    return NextResponse.json({
      success: true,
      markdown,
      isBlank,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : ""
    console.error("[v0] API: CRITICAL ERROR in parse-and-check-blank:", errorMsg)
    console.error("[v0] API: Error stack:", errorStack)

    // Return a safe default to not block processing
    return NextResponse.json(
      {
        success: false,
        markdown: "",
        isBlank: false,
        error: errorMsg,
      },
      { status: 200 },
    )
  }
}

async function apiParse(imageBase64: string): Promise<string> {
  if (!LANDING_API_KEY) {
    throw new Error("VISION_AGENT_API_KEY environment variable is not configured")
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
  const buffer = Buffer.from(base64Data, "base64")

  const formData = new FormData()
  formData.append("document", new Blob([buffer]), "image.jpg")
  formData.append("model", "dpt-2-latest")

  const response = await retryWithBackoff(async () => {
    const res = await fetch(`${API_BASE_URL}/v1/ade/parse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LANDING_API_KEY}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error("[v0] API: Landing AI Parse FAILED:", res.status, errorBody.substring(0, 500))
      if (res.status === 429 || errorBody.includes("Too Many")) {
        throw new Error(`Rate limit: ${res.status} - ${errorBody}`)
      }
      throw new Error(`Parse API failed: ${res.status} - ${errorBody}`)
    }

    console.log("[v0] API: Landing AI Parse response status:", res.status)
    return res
  })

  const data: ParseResponse = await response.json()
  console.log("[v0] API: Landing AI Parse result markdown length:", data.markdown?.length || 0)
  return data.markdown
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse | null> {
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

    if (res.status === 422) {
      const textBody = await res.text()
      try {
        const errorBody = JSON.parse(textBody)
        if (errorBody.error === "File is empty.") {
          return { ok: true, status: 200, empty: true } as any
        }
      } catch {
        if (textBody.includes("File is empty")) {
          return { ok: true, status: 200, empty: true } as any
        }
      }
      throw new Error(`Extract API failed: ${res.status} - ${textBody}`)
    }

    if (!res.ok) {
      const errorText = await res.text()
      if (res.status === 429 || errorText.includes("Too Many")) {
        throw new Error(`Rate limit: ${res.status} - ${errorText}`)
      }
      throw new Error(`Extract API failed: ${res.status} - ${errorText}`)
    }

    return res
  })

  if ((response as any).empty) {
    return null
  }

  return await response.json()
}
