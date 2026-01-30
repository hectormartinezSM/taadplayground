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

    const schemaClasGeneral = JSON.stringify({
      properties: {
        Clasify: {
          anyOf: [{ type: "string" }, { type: "null" }],
          default: null,
          description:
            'Eres un clasificador de tipologías documentales. Elige una tipología del catálogo haciendo posible encajar el documento dentro. Si no encaja de ninguna forma, crear un nombre para la tipología siguiendo el mismo patrón que los nombres propuestos. Los tipos documentales están en cada línea de las próximas antes de los ":", lo que viene después es la descripción.\n\nDNI: Documento Nacional de Identidad español con foto, número DNI, fecha de caducidad y firma.\nNIE: Identidad de extranjero en España con letra inicial, número, fecha de caducidad y autoridad.\nPasaporte: Pasaporte con país emisor, número, foto, fechas de expedición/caducidad.\nID No Español: Documento oficial de identidad extranjero distinto de DNI/NIE, con foto y número.\nLibro de familia: Libro oficial con inscripciones de matrimonio y nacimientos/hijos.\nCIF: Identificador fiscal de entidad (NIF de persona jurídica) con razón social.\nCarnet conducir: Permiso de conducción con número, clases autorizadas, fechas y foto.\nCertificado de nacimiento: Certificación registral de nacimiento con datos de filiación y fecha.\nCertificado de matrimonio: Certificación registral de matrimonio con datos de contrayentes y fecha.\nCertificado de defunción: Certificación registral de fallecimiento con fecha y lugar.\nSentencia de Separación: Resolución judicial firme de separación/divorcio con juzgado, fecha y partes.\nCertificado últimas voluntades: Justificante del Registro de Últimas Voluntades con número y fecha.\nCertificado de empadronamiento: Certificado municipal de domicilio y convivencia con fecha de expedición.\nContrato laboral: Contrato de trabajo con empresa, trabajador, jornada, categoría y fechas.\nFiniquito laboral: Documento de liquidación/recibo de salarios pendientes al término de relación laboral.\nNómina: Recibo mensual de salarios con base, complementos, deducciones y líquido.\nCertificado de empresa: Certificado que detalla relación laboral, periodos trabajados y retribuciones.\nTarjeta Seguridad Social: Tarjeta con número de afiliación.',
          title: "Clasify",
        },
      },
      title: "TipoGeneral",
      type: "object",
    })

    let classification = "Otros"

    try {
      console.log("[v0] API: Trying general classification schema...")
      const result1 = await apiExtract(joinedMarkdown, schemaClasGeneral)

      if (result1.extraction && result1.extraction.Clasify) {
        classification = result1.extraction.Clasify
      }
    } catch (error) {
      console.log("[v0] API: General classification failed, defaulting to Otros")
      classification = "Otros"
    }

    if (classification === "Otros") {
      const schemaClasOtros = JSON.stringify({
        properties: {
          Clasify: {
            anyOf: [{ type: "string" }, { type: "null" }],
            default: null,
            description:
              "Eres un clasificador de tipologías documentales. Dime el tipo de documento que es. Piensa que eres responsable de un banco, aseguradora para plantearte la tipología. El nombre de la tipología documental estará siempre en castellano. Intenta definirlo en el menor número de palabras posible.",
            title: "Clasify",
          },
        },
        title: "TipoOtros",
        type: "object",
      })

      try {
        console.log('[v0] API: Trying specific "Otros" classification schema...')
        const result2 = await apiExtract(joinedMarkdown, schemaClasOtros)

        if (result2.extraction && result2.extraction.Clasify) {
          classification = result2.extraction.Clasify
        }
      } catch (error) {
        console.log("[v0] API: Specific classification also failed, keeping as Otros")
        classification = "Otros"
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
