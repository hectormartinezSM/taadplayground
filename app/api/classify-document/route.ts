import { type NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"

const classificationSchema = z.object({
  tipo_documento: z.enum(["factura_intragrupo", "factura_con_albaran", "otro_documento"]),
  subtipo: z.string().describe("Subtipo mas especifico si aplica. Para facturas: 'Factura Intragrupo', 'Factura Simple'. Para otros: 'Convenio', 'Contrato', etc."),
  confianza: z.number().min(0).max(1).describe("Nivel de confianza en la clasificacion, de 0 a 1"),
})

const SYSTEM_PROMPT = `Eres un agente clasificador de documentos de Fundacion IberCaja. Tu tarea es clasificar documentos en una de tres categorias.

REGLAS DE CLASIFICACION:

1. **factura_con_albaran**: El documento es una factura que INCLUYE o REFERENCIA albaranes. Indicadores:
   - Menciona explicitamente "albaran", "albaran n", "nota de entrega", "delivery note"
   - Contiene hojas de albaran adjuntas como paginas separadas
   - La factura resume o consolida datos de uno o mas albaranes
   - Hay numeros de albaran referenciados en el cuerpo de la factura

2. **factura_intragrupo**: El documento es una factura SIN referencia a albaranes. Incluye:
   - Facturas intragrupo (entre empresas del mismo grupo Ibercaja)
   - Facturas simples de proveedores sin albaran
   - Cualquier factura que NO mencione albaranes
   - Indicadores: "factura", "invoice", NIF/CIF, importes, IVA, base imponible, numero de factura

3. **otro_documento**: Cualquier documento que NO sea una factura. Incluye:
   - Convenios de colaboracion
   - Contratos
   - Acuerdos marco
   - Documentos administrativos, legales, o de otro tipo

IMPORTANTE:
- Si el documento tiene estructura de factura (emisor, receptor, importes, IVA, numero de factura), SIEMPRE es factura_intragrupo o factura_con_albaran.
- La diferencia entre ambas facturas es UNICAMENTE la presencia/referencia de albaranes.
- Si dudas entre factura y otro, prioriza factura si hay importes + IVA + numero de factura.`

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, markdown } = await request.json()

    if (!markdown && (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0)) {
      return NextResponse.json({ error: "Markdown or image URLs are required" }, { status: 400 })
    }

    console.log("[v0] API: Classifying document with LLM...")

    // Use the markdown that was already parsed by the OCR step
    let documentContent = markdown || ""

    if (!documentContent && imageUrls) {
      // Fallback: if no markdown provided, we need to parse first
      // This shouldn't happen in normal flow since page-grid passes markdown
      return NextResponse.json({ error: "Markdown content is required for classification" }, { status: 400 })
    }

    const { output } = await generateText({
      model: "anthropic/claude-sonnet-4-20250514",
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

    console.log("[v0] API: Document classified as:", output.tipo_documento, "subtipo:", output.subtipo, "confianza:", output.confianza)

    // Map internal types to display names
    let displayType: string
    switch (output.tipo_documento) {
      case "factura_intragrupo":
        displayType = "Factura Intragrupo"
        break
      case "factura_con_albaran":
        displayType = "Factura con Albaran"
        break
      case "otro_documento":
        displayType = output.subtipo || "Otro Documento"
        break
      default:
        displayType = "Otro Documento"
    }

    return NextResponse.json({
      type: displayType,
      internalType: output.tipo_documento,
      subtipo: output.subtipo,
      confidence: output.confianza,
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
