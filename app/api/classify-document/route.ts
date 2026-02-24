import { type NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"

export const maxDuration = 60

const classificationSchema = z.object({
  tipo_documento: z.enum(["albaran", "factura_proveedor"]),
  confianza: z.number().min(0).max(1).describe("Nivel de confianza en la clasificacion, de 0 a 1"),
  razon: z.string().describe("Breve justificacion de la clasificacion en 1-2 frases"),
})

const SYSTEM_PROMPT = `Eres un agente clasificador de documentos para Fundacion IberCaja. Tu tarea es clasificar documentos EXCLUSIVAMENTE en dos categorias:

- albaran
- factura_proveedor

ORDEN DE EVALUACION (obligatorio):
Primero evalua si es un ALBARAN. Solo si NO es albaran, evalua si es factura proveedor.
Esto evita clasificaciones erroneas cuando existan importes sin estructura fiscal completa.

CRITERIOS DE CLASIFICACION:

1. **albaran** — Se clasificara como Albaran si contiene senales como:
   - "Albaran", "Albaran de entrega", "Nota de entrega", "Delivery note", "N albaran", "Documento de entrega"
   - Puede contener cantidades y precios
   - NO contiene estructura fiscal formal completa (base imponible + desglose IVA + total estructurado)

2. **factura_proveedor** — Se clasificara como Factura proveedor si contiene:
   - "Factura", "Factura n", "Invoice", "N factura"
   - Base imponible
   - Desglose de IVA
   - Total factura
   - CIF/NIF emisor
   - Nunca debera clasificarse como factura si el documento responde claramente a estructura de albaran.

REGLA CLAVE: Si el documento tiene estructura fiscal completa (base + IVA + total), es factura_proveedor. Si tiene productos/cantidades pero sin estructura fiscal completa, es albaran.`

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, markdown } = await request.json()

    if (!markdown && (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0)) {
      return NextResponse.json({ error: "Markdown or image URLs are required" }, { status: 400 })
    }

    console.log("[v0] API: Classifying document with LLM...")

    const documentContent = markdown || ""

    if (!documentContent) {
      return NextResponse.json({ error: "Markdown content is required for classification" }, { status: 400 })
    }

    const { output } = await generateText({
      model: "anthropic/claude-sonnet-4.6",
      output: Output.object({
        schema: classificationSchema,
      }),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Clasifica el siguiente documento:\n\n${documentContent}`,
        },
      ],
    })

    if (!output) {
      throw new Error("No classification output received from LLM")
    }

    console.log("[v0] API: Document classified as:", output.tipo_documento, "confianza:", output.confianza, "razon:", output.razon)

    // Map internal types to display names
    const displayType = output.tipo_documento === "albaran" ? "Albaran" : "Factura Proveedor"

    return NextResponse.json({
      type: displayType,
      internalType: output.tipo_documento,
      confidence: output.confianza,
      razon: output.razon,
      markdown: documentContent,
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
