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
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "document.md")
  formData.append("schema", schema)
  formData.append("model", "extract-latest")

  const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
    signal: AbortSignal.timeout(90000),
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
    const newText = `# Page ${i + 1}\n\n${markdowns[i]}\n\n ---\n\n`
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

    const schemaClasGeneral = JSON.stringify({
      properties: {
        Clasify: {
          anyOf: [{ type: "string" }, { type: "null" }],
          default: null,
          description: `CLASSIFICATION INSTRUCTIONS (MANDATORY)

You must classify the document using IDEALLY one of the EXACT typologies from the following list.
- If it matches one of them, return THE EXACT LITERAL (same spelling and capitalization).
- Do not rephrase, do not add clarifications.
- If you CANNOT confidently assign it to any typology in the list, create a new typology:
  - It must be AS SHORT AS POSSIBLE (target <= 25 characters).
  - No articles ("the/a"), no sentences, no redundant details.
  - 2-4 words maximum.

LIST OF ALLOWED TYPOLOGIES (EXACT LITERAL):
Lab Report
Medical Report
Pathology Report
Accident Statement
Insurance Claim
Insurance Invoice
Insurance Policy
Sales Receipt
Receipt
Invoice
Purchase Order
Delivery Note
Credit Note
Contract
Employment Contract
Payslip
Tax Return
Tax Form
Bank Statement
Bank Certificate
Financial Statement
Audit Report
Balance Sheet
Profit and Loss Statement
Identity Document
Passport
Driver License
Birth Certificate
Marriage Certificate
Death Certificate
Mortgage Deed
Property Deed
Lease Agreement
Power of Attorney
Will and Testament
Court Order
Court Summons
Police Report
Medical Certificate
Prescription
Certificate of Incorporation
Board Resolution
Shipping Document
Bill of Lading
Customs Declaration
Travel Itinerary
Boarding Pass
Hotel Reservation
Inspection Report
Appraisal Report
Letter
Memo
Photograph`,
          title: "Clasify",
        },
      },
      title: "GeneralType",
      type: "object",
    })

    let classification = "Other"

    try {
      console.log("[v0] API: Trying general classification schema...")
      const result1 = await apiExtract(joinedMarkdown, schemaClasGeneral)
      console.log("[v0] API: General classification raw result:", JSON.stringify(result1))

      if (result1.extraction && result1.extraction.Clasify) {
        classification = result1.extraction.Clasify
      } else {
        console.log("[v0] API: Clasify field was null/empty, will try fallback")
      }
    } catch (error) {
      console.log("[v0] API: General classification failed:", error instanceof Error ? error.message : error)
      classification = "Other"
    }

    if (classification === "Other") {
      const schemaClasOther = JSON.stringify({
        properties: {
          Clasify: {
            anyOf: [{ type: "string" }, { type: "null" }],
            default: null,
            description:
              "You could not classify the document with the predefined typologies. Create a new typology AS SHORT AS POSSIBLE (target <= 25 characters). No articles, no sentences, 2-4 words maximum. Examples: 'Franchise Contract', 'Expert Report', 'Donation Receipt'.",
            title: "Clasify",
          },
        },
        title: "OtherType",
        type: "object",
      })

      try {
        console.log('[v0] API: Trying specific "Other" classification schema...')
        const result2 = await apiExtract(joinedMarkdown, schemaClasOther)

        if (result2.extraction && result2.extraction.Clasify) {
          classification = result2.extraction.Clasify
        }
      } catch (error) {
        console.log("[v0] API: Specific classification also failed, keeping as Other")
        classification = "Other"
      }
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
