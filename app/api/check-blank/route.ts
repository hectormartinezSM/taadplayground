import { type NextRequest, NextResponse } from "next/server"
import { retryWithBackoff } from "@/lib/api-retry"

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

export const parseCache = new Map<string, string>()

async function apiParse(imageBase64: string): Promise<string> {
  if (parseCache.has(imageBase64)) {
    console.log("[v0] API: Using cached parse result")
    return parseCache.get(imageBase64)!
  }

  if (!LANDING_API_KEY) {
    throw new Error(
      "VISION_AGENT_API_KEY environment variable is not configured. Please get your API key from https://va.eu-west-1.landing.ai/settings/api-key",
    )
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
      if (res.status === 401) {
        throw new Error(
          `Authentication failed (401). Please verify your API key is correct and valid for the EU endpoint. Get your key from: https://va.eu-west-1.landing.ai/settings/api-key. Error: ${errorBody}`,
        )
      }
      if (res.status === 429 || errorBody.includes("Too Many")) {
        throw new Error(`Rate limit: ${res.status} - ${errorBody}`)
      }
      throw new Error(`Parse API failed: ${res.status} - ${errorBody}`)
    }

    return res
  })

  const data: ParseResponse = await response.json()

  parseCache.set(imageBase64, data.markdown)

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

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }

    console.log("[v0] API: Checking if page is blank...")

    const markdown = await apiParse(imageUrl)
    console.log("[v0] API: Received markdown from parse")

    const trimmedMarkdown = markdown.trim()
    if (!trimmedMarkdown || trimmedMarkdown.length < 10) {
      console.log("[v0] API: Markdown is empty or too short - treating as blank page")
      return NextResponse.json({ isBlank: true })
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
      console.log("[v0] API: File is empty - treating as blank page")
      return NextResponse.json({ isBlank: true })
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

    return NextResponse.json({ isBlank })
  } catch (error) {
    console.error("[v0] API: Error checking blank page:", error)

    return NextResponse.json(
      {
        isBlank: false,
        error: "Rate limit reached - treating as non-blank to continue processing",
      },
      { status: 200 },
    )
  }
}
