import { type NextRequest, NextResponse } from "next/server"

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY
const API_BASE_URL = "https://api.va.eu-west-1.landing.ai"

const fieldsCache = new Map<string, string[]>()

interface ExtractResponse {
  extraction: {
    Campos?: string
  }
}

const PREDEFINED_FIELDS: Record<string, string[]> = {
  DNI: ["Nombre completo", "DNI", "Fecha de nacimiento", "Fecha de validez", "Sexo", "Nacionalidad", "Domicilio"],
  NOMINA: [
    "Nombre completo",
    "DNI",
    "Nº Seguridad Social trabajador",
    "Fecha antigüedad",
    "Nombre empresa",
    "CIF empresa",
    "Periodo",
    "Líquido a percibir",
    "Total devengado (documento)",
    "Total retenciones (documento)",
    "Devengos",
    "Retenciones",
  ],
  VIDA_LABORAL: [
    "Nombre completo",
    "DNI",
    "Nº Seguridad Social trabajador",
    "Total días cotizados",
    "Fecha documento",
    "Código CEA",
    "Situaciones",
  ],
  NOTA_SIMPLE: [
    "Registro de la propiedad",
    "Registrador",
    "Fecha de la nota",
    "Número de finca",
    "CRU",
    "Superficie total",
    "¿Es VPO?",
    "¿Tiene cargas?",
    "Titularidades",
  ],
  MODELO_100_IRPF: [
    "Nombre completo",
    "Periodo",
    "Fecha de presentación",
    "Estado civil",
    "Rendimiento del trabajo",
    "Resultado de la declaración",
    "CSV",
  ],
}

// Función para detectar si el tipo de documento coincide con alguno predefinido
function getPredefinedFields(documentType: string): string[] | null {
  const normalizedType = documentType.toLowerCase().trim()

  // Detectar DNI
  if (
    normalizedType.includes("dni") ||
    normalizedType.includes("documento nacional de identidad") ||
    normalizedType.includes("documento de identidad")
  ) {
    return PREDEFINED_FIELDS["DNI"]
  }

  // Detectar Nómina
  if (
    normalizedType.includes("nómina") ||
    normalizedType.includes("nomina") ||
    normalizedType.includes("recibo de salario") ||
    normalizedType.includes("recibo salarial")
  ) {
    return PREDEFINED_FIELDS["NOMINA"]
  }

  // Detectar Vida Laboral
  if (
    normalizedType.includes("vida laboral") ||
    normalizedType.includes("informe de vida laboral") ||
    normalizedType.includes("certificado de vida laboral") ||
    normalizedType.includes("historial laboral")
  ) {
    return PREDEFINED_FIELDS["VIDA_LABORAL"]
  }

  // Detectar Nota Simple
  if (
    normalizedType.includes("nota simple") ||
    normalizedType.includes("certificación registral") ||
    normalizedType.includes("registro de la propiedad") ||
    normalizedType.includes("certificado registral")
  ) {
    return PREDEFINED_FIELDS["NOTA_SIMPLE"]
  }

  // Detectar Modelo 100 - Declaración de IRPF
  if (
    normalizedType.includes("modelo 100") ||
    normalizedType.includes("declaración de irpf") ||
    normalizedType.includes("declaracion de irpf") ||
    normalizedType.includes("irpf") ||
    normalizedType.includes("renta")
  ) {
    return PREDEFINED_FIELDS["MODELO_100_IRPF"]
  }

  return null
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse | null> {
  const formData = new FormData()
  formData.append("markdown", new Blob([markdown], { type: "text/markdown" }), "documento.md")
  formData.append("schema", schema)
  formData.append("model", "extract-latest")

  try {
    const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LANDING_API_KEY}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.log("[v0] API: Extract failed -", response.status, errorBody)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("[v0] API: Extract error:", error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { markdown, documentType } = await request.json()

    if (!markdown || !documentType) {
      return NextResponse.json({ error: "Markdown and document type are required" }, { status: 400 })
    }

    const predefinedFields = getPredefinedFields(documentType)
    if (predefinedFields) {
      console.log("[v0] API: Using predefined fields for document type:", documentType)
      fieldsCache.set(documentType, predefinedFields)
      return NextResponse.json({ fields: predefinedFields })
    }

    if (fieldsCache.has(documentType)) {
      console.log("[v0] API: Using cached relevant fields for type:", documentType)
      return NextResponse.json({
        fields: fieldsCache.get(documentType),
      })
    }

    console.log("[v0] API: Getting relevant fields for document type:", documentType)

    if (documentType === "Fotografía") {
      const fields = ["Descripción de la fotografía"]
      fieldsCache.set(documentType, fields)
      return NextResponse.json({ fields })
    }

    const schemaCampos = JSON.stringify({
      properties: {
        Campos: {
          anyOf: [{ type: "string" }, { type: "null" }],
          default: null,
          description:
            "Tienes que identificar la informacion mas relevante en el documento. No tienes que sacar el valor, sino el campo a identificar.Piensa que eres responsable de un banco, aseguradora para plantearte la informacion que te interesaIdentifica los cinco campos más relevantes del documento segun su tipologia documentalDevelveme los campos relevantes separados por ; El nombre de los campos estara siempre en castellano",
          title: "Campos",
        },
      },
      title: "CamposRelevantes",
      type: "object",
    })

    const extCampos = await apiExtract(markdown, schemaCampos)

    let fields: string[] = []

    if (extCampos && extCampos.extraction && extCampos.extraction.Campos) {
      fields = extCampos.extraction.Campos.split(";")
        .map((field) => field.trim())
        .filter((field) => field.length > 0)
    }

    const excludedFieldPatterns = [
      /modelo\s*(de)?\s*declaraci[oó]n/i,
      /tipo\s*(de)?\s*modelo/i,
      /n[uú]mero\s*(de)?\s*modelo/i,
      /modelo\s*tributario/i,
    ]

    const isTaxModel = /modelo\s*\d+/i.test(documentType)

    if (isTaxModel) {
      fields = fields.filter((field) => {
        const shouldExclude = excludedFieldPatterns.some((pattern) => pattern.test(field))
        if (shouldExclude) {
          console.log("[v0] API: Excluding field for tax model:", field)
        }
        return !shouldExclude
      })
    }

    console.log("[v0] API: Extracted fields:", fields)

    if (fields.length > 0) {
      fieldsCache.set(documentType, fields)
    }

    return NextResponse.json({ fields })
  } catch (error) {
    console.error("[v0] API: Error getting relevant fields:", error)

    return NextResponse.json(
      {
        error: "Failed to get relevant fields",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
