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
          description: `INSTRUCCIONES DE CLASIFICACIÓN (OBLIGATORIAS)

Debes clasificar el documento usando IDEALMENTE una de las tipologías EXACTAS de la siguiente lista.
- Si encaja con una de ellas, devuelve EL MISMO LITERAL (misma ortografía, mayúsculas y acentos).
- No traduzcas, no reformules, no añadas aclaraciones.
- Si NO puedes asignarlo con confianza a ninguna tipología de la lista, crea una tipología nueva:
  - Debe ser lo MÁS CORTA POSIBLE (objetivo <= 25 caracteres).
  - Sin artículos ("el/la"), sin frases, sin detalles redundantes.
  - 2-4 palabras máximo.

CRITERIOS DETALLADOS DE CLASIFICACIÓN:

REGLA DE PRECEDENCIA OBLIGATORIA: Debes evaluar las tipologías judiciales en el orden estricto que se indica a continuación. Si un documento encaja con la PRIMERA regla, clasifícalo con esa tipología y NO sigas evaluando las siguientes.

ORDEN 1 – "Diligencia de ordenación" (evaluar PRIMERO, SIEMPRE antes que "Escrito al juzgado"):
  Clasificar como "Diligencia de ordenación" si el documento contiene CUALQUIERA de estas señales:
  A) Expresiones literales como "DILIGENCIA DE ORDENACIÓN", "DILIGENCIA DE ORDENACION", "DILIGENCIA", "el/la Letrado/a de la Administración de Justicia", "el/la LAJ", "ACUERDO", "Se tiene por presentado".
  B) El documento es emitido POR el juzgado (por el Letrado de la Administración de Justicia o el Secretario Judicial), NO presentado por una parte procesal.
  C) Si la primera página con contenido procesal (ignorando portadas administrativas, carátulas de envío o páginas LexNET) contiene una Diligencia, esa tipología PREVALECE sobre cualquier otro contenido posterior.
  CLAVE: Si aparece la palabra "DILIGENCIA" en el cuerpo procesal → clasificar como "Diligencia de ordenación". Sin excepciones.

ORDEN 2 – "Escrito al juzgado" (evaluar SOLO si NO es Diligencia de ordenación):
  Clasificar como "Escrito al juzgado" si el documento cumple AL MENOS DOS de los siguientes criterios:
  A) Encabezado judicial (destinatario): referencias a órgano judicial como "JUZGADO DE ...", "JUZGADO DE PRIMERA INSTANCIA ...", número de procedimiento (ej: "Procedimiento", "Autos", "ETJ", "Ejecución", etc.)
  B) Fórmulas procesales típicas: expresiones como "comparezco y DIGO", "SUPLICO AL JUZGADO", "SOLICITO AL JUZGADO"
  C) Representación procesal: texto que indique "Procurador/a de los Tribunales en nombre y representación de", "según acredito mediante poder"
  D) Estructura formal de escrito judicial: identificación de partes, petición concreta al órgano judicial, fecha y localidad al final ("En [ciudad], a [fecha]")
  CLAVE DIFERENCIADORA: El Escrito al juzgado es presentado POR una parte procesal (procurador, abogado) AL juzgado. Si el documento es emitido por el propio juzgado, NO es un Escrito al juzgado.

LISTA DE TIPOLOGÍAS PERMITIDAS (LITERAL EXACTO):
Escrito al juzgado
Diligencia de ordenación
Nota Simple
DNI
NIE
Pasaporte
ID No Español
Libro de familia
CIF
Carnet conducir
Certificado de nacimiento
Certificado de matrimonio
Certificado de defunción
Sentencia de Separación
Certificado últimas voluntades
Certificado de empadronamiento
Contrato laboral
Finiquito laboral
Nomina
Vida laboral
Certificado retenciones Seguridad Social
Certificado corriente pago Seguridad social
Certificado corriente pago Agencia Tributaria
Pensión
Toma posesión funcionario
Escritura hipotecaria
Escritura compraventa
Testamento
Repartición herencia
Escritura de poder
Escritura declaración de obra nueva
Escritura constitución entidad
Tasación
Nota Simple
Contrato alquiler
Resolución contra alquiler
Certificado catastral
Nota registro mercantil
Declaración de Residencia Fiscal
Modelo 100 - Declaración de IRPF
Modelo 130 AEAT
Modelo 131 AEAT
Modelo 303 AEAT
Modelo 200 AEAT
Modelo 347 AEAT
Otros modelos tributarios
Contrato bancario
Justificante bancario
Certificado de titularidad de cuenta
Factura ordinaria
Factura IBI
Presupuesto
Albarán
Ticket
Pagaré
Cheque
Parte médico
Fotografía
Póliza seguros
Ficha técnica vehículo
Atestado policial
Permiso circulación vehículo
Acta junta propietarios
Declaración amistosa accidente
Tarjeta embarque
Reserva alojamiento
Sanción
Pago tasas
CIRBE
Auditoría anual empresa
Licencia obras
Balance
Cuenta de pérdidas y ganancias
Decreto
Auto
Denuncia
Demanda
Citación judicial`,
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
              "No pudiste clasificar el documento con las tipologías predefinidas. Crea una tipología nueva lo MÁS CORTA POSIBLE (objetivo <= 25 caracteres). Sin artículos, sin frases, 2-4 palabras máximo. Ejemplos: 'Contrato franquicia', 'Informe pericial', 'Recibo donación'.",
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
