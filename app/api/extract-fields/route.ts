import { type NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"

// --- Zod Schemas matching the spec exactly ---

const conceptoFacturableSchema = z.object({
  concepto: z.string().describe("Descripcion del concepto facturable"),
  cantidad: z.string().describe("Cantidad. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  precioUnitario: z.string().describe("Precio unitario con formato XX.XXX,XX. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  baseImponible: z.string().describe("Base imponible = cantidad x precioUnitario. Si no se puede calcular: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  porcentajeIVA: z.string().describe("Porcentaje de IVA aplicado. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  importeIVA: z.string().describe("Importe del IVA. Si no aparece pero puede calcularse, calcularlo. Si no: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
})

const grupoAlbaranSchema = z.object({
  numAlbaran: z.string().describe("Numero de albaran asociado a este grupo de conceptos. Si no hay albaran asociado: 'N/D'"),
  fechaAlbaran: z.string().describe("Fecha del albaran en formato DD/MM/AAAA. Si no hay fecha: 'N/D'"),
  conceptos: z.array(conceptoFacturableSchema).describe("Conceptos facturables de este albaran"),
})

const desgloseImpuestoSchema = z.object({
  tipo: z.string().describe("Tipo de impuesto, ej: 'IVA 21%', 'IVA 10%'"),
  base: z.string().describe("Base imponible de este tramo con formato XX.XXX,XX"),
  cuota: z.string().describe("Cuota/importe del impuesto con formato XX.XXX,XX"),
})

const desgloseRetencionSchema = z.object({
  tipo: z.string().describe("Tipo de retencion, ej: 'IRPF 15%'"),
  base: z.string().describe("Base de la retencion con formato XX.XXX,XX"),
  cuota: z.string().describe("Cuota/importe de la retencion con formato XX.XXX,XX"),
}).nullable()

const facturaProveedorSchema = z.object({
  numero_factura: z.string().describe("Numero de factura tal como aparece en el documento, SIN espacios"),
  serie: z.string().describe("Serie de la factura. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  fecha_emision: z.string().describe("Fecha de emision en formato DD/MM/AAAA"),
  proveedor: z.string().describe("Nombre del proveedor/emisor"),
  cif_nif_proveedor: z.string().describe("CIF/NIF del proveedor en mayusculas, sin espacios. Si esta tapado: 'Dato anonimizado en origen'"),
  direccion_proveedor: z.string().describe("Direccion del proveedor. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  cliente: z.string().describe("Nombre del cliente/receptor"),
  cif_nif_cliente: z.string().describe("CIF/NIF del cliente en mayusculas, sin espacios. Si esta tapado: 'Dato anonimizado en origen'"),
  conceptos_facturables: z.array(grupoAlbaranSchema).describe("Conceptos facturables agrupados por albaran. Si la factura tiene albaranes asociados, agrupar los conceptos bajo cada albaran con su numAlbaran y fechaAlbaran. Si la factura NO tiene albaranes, crear un unico grupo con numAlbaran='N/D' y fechaAlbaran='N/D'. baseImponible = cantidad x precioUnitario. Si importeIVA no aparece pero puede calcularse, calcularlo."),
  base_imponible_total: z.string().describe("Base imponible total con formato XX.XXX,XX"),
  tipo_impuesto_indirecto: z.string().describe("Tipo de impuesto indirecto: 'IVA', 'IGIC', o 'N/D' si no aplica"),
  desglose_impuesto_indirecto: z.array(desgloseImpuestoSchema).describe("Desglose del impuesto indirecto por tramos. Si no hay impuesto: array vacio"),
  tipo_retencion: z.string().describe("Tipo de retencion: 'IRPF' o 'N/D' si no aplica"),
  desglose_retencion: desgloseRetencionSchema.describe("Desglose de la retencion. null si no aplica"),
  total_factura: z.string().describe("Total de la factura con formato XX.XXX,XX"),
  resumen_factura: z.string().describe("Resumen de la factura en 3-7 palabras"),
  datos_anonimizados: z.array(z.string()).describe("Lista de nombres de campos cuyo valor esta cubierto/tapado por una caja negra, rectangulo negro, pegote o pixelado. Solo si hay evidencia visual clara de ocultacion deliberada."),
})

const conceptoEntregadoSchema = z.object({
  concepto: z.string().describe("Descripcion del concepto/producto entregado"),
  codigoArticulo: z.string().describe("Codigo de articulo. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  cantidadEntregada: z.string().describe("Cantidad entregada"),
  unidad: z.string().describe("Unidad de medida. Si no aparece: 'N/D'"),
  precioUnitario: z.string().describe("Precio unitario. Por defecto 'N/D'. No inventar. Si esta tapado: 'Dato anonimizado en origen'"),
  importeLinea: z.string().describe("Importe de la linea. Por defecto 'N/D'. No inventar. Si esta tapado: 'Dato anonimizado en origen'"),
})

const albaranSchema = z.object({
  numero_albaran: z.string().describe("Numero de albaran tal como aparece en el documento"),
  fecha_albaran: z.string().describe("Fecha del albaran en formato DD/MM/AAAA"),
  proveedor: z.string().describe("Nombre del proveedor. Si no aparece: 'N/D'"),
  cif_nif_proveedor: z.string().describe("CIF/NIF del proveedor en mayusculas, sin espacios. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  cliente: z.string().describe("Nombre del cliente. Si no aparece: 'N/D'"),
  referencia_pedido: z.string().describe("Referencia del pedido. Si no aparece: 'N/D'. Si esta tapado: 'Dato anonimizado en origen'"),
  conceptos_entregados: z.array(conceptoEntregadoSchema).describe("Array de conceptos/productos entregados. No inventar importes. No calcular impuestos."),
  observaciones: z.string().describe("Observaciones si existen. Si no: 'N/D'"),
  datos_anonimizados: z.array(z.string()).describe("Lista de nombres de campos cuyo valor esta cubierto/tapado por una caja negra, rectangulo negro, pegote o pixelado. Solo si hay evidencia visual clara de ocultacion deliberada."),
})

// --- System Prompts matching the spec ---

const FACTURA_SYSTEM_PROMPT = `Eres un agente extractor de datos de facturas de proveedor para Fundacion IberCaja. Tu tarea es extraer con maxima precision todos los campos de la factura.

REGLAS OBLIGATORIAS:

1. FORMATO DE FECHAS: DD/MM/AAAA (ejemplo: 31/12/2025)
2. FORMATO DE IMPORTES: XX.XXX,XX (separador miles: punto, decimal: coma). Ejemplo: 1.442,74
3. CIF/NIF: Siempre en MAYUSCULAS y SIN espacios. Ejemplo: B50012345, G50000652
4. NUMERO DE FACTURA: Exactamente como aparece en el documento, SIN espacios.
5. CONCEPTOS FACTURABLES: Extrae TODOS los conceptos/lineas de la factura, AGRUPADOS POR ALBARAN.
   - Si la factura referencia albaranes (ej: "N Albaran: 2511047 Fecha: 05/12/2025"), crear un grupo por cada albaran con su numAlbaran y fechaAlbaran
   - Si la factura NO tiene albaranes asociados, crear un unico grupo con numAlbaran="N/D" y fechaAlbaran="N/D"
   - Cada grupo contiene un array "conceptos" con las lineas de producto de ese albaran
   - baseImponible = cantidad x precioUnitario (calcularlo si los datos estan disponibles)
   - Si importeIVA no aparece pero puede calcularse a partir del porcentajeIVA y la base, CALCULARLO
   - Si falta informacion que no se puede deducir: "N/D"
6. DESGLOSE IMPUESTO INDIRECTO: Indica tipo_impuesto_indirecto como "IVA", "IGIC" o "N/D". Desglosa por tramos si hay varios tipos de IVA.
7. RETENCIONES: Si hay IRPF u otra retencion, indicar tipo y desglose. Si no hay: tipo_retencion = "N/D", desglose_retencion = null.
8. RESUMEN: Resumen de la factura en 3-7 palabras (ej: "Servicio alojamiento web Drupal", "Catering evento corporativo").

REGLA DE ANONIMIZACION:
- Si un campo esta cubierto por una caja negra, tapado por un rectangulo negro, ocultado mediante pegote negro, pixelado de forma intencionada o totalmente tachado de forma opaca, Y no es posible recuperar el contenido:
  - El valor del campo DEBE ser exactamente: "Dato anonimizado en origen"
  - Ademas, incluir el nombre del campo en datos_anonimizados
  - NO intentar inferir ni estimar el dato
  - NO devolver "N/D" en estos casos (N/D es para campos que simplemente no aparecen)

9. Si un campo no existe en el documento y NO esta anonimizado: "N/D".`

const ALBARAN_SYSTEM_PROMPT = `Eres un agente extractor de datos de albaranes para Fundacion IberCaja. Tu tarea es extraer con maxima precision todos los campos del albaran.

REGLAS OBLIGATORIAS:

1. FORMATO DE FECHAS: DD/MM/AAAA (ejemplo: 31/12/2025)
2. FORMATO DE IMPORTES: XX.XXX,XX (separador miles: punto, decimal: coma) — solo si el importe aparece explicitamente
3. CIF/NIF: Siempre en MAYUSCULAS y SIN espacios
4. CONCEPTOS ENTREGADOS: Extrae TODOS los productos/conceptos entregados
   - NO inventar importes
   - NO calcular impuestos
   - Si precioUnitario o importeLinea no aparecen: "N/D"
5. Si un campo simplemente no aparece en el documento: "N/D"

REGLA DE ANONIMIZACION:
- Si un campo esta cubierto por una caja negra, tapado por un rectangulo negro, ocultado mediante pegote negro, pixelado de forma intencionada o totalmente tachado de forma opaca, Y no es posible recuperar el contenido:
  - El valor del campo DEBE ser exactamente: "Dato anonimizado en origen"
  - Ademas, incluir el nombre del campo en datos_anonimizados
  - NO intentar inferir ni estimar el dato
  - NO devolver "N/D" en estos casos (N/D es para campos que simplemente no aparecen)
  - Esta regla aplica a TODOS los campos definidos`

// --- Flattening functions ---

function flattenFacturaData(
  data: z.infer<typeof facturaProveedorSchema>,
  fields: string[],
): Record<string, { value: string; confidence: number }> {
  const result: Record<string, { value: string; confidence: number }> = {}

  const formatConceptos = () => {
    if (!data.conceptos_facturables || data.conceptos_facturables.length === 0) return "N/D"
    // Keep the grouped structure: array of { numAlbaran, fechaAlbaran, conceptos: [...] }
    return JSON.stringify(data.conceptos_facturables)
  }

  const formatDesgloseImpuesto = () => {
    if (!data.desglose_impuesto_indirecto || data.desglose_impuesto_indirecto.length === 0) return "N/D"
    return JSON.stringify(data.desglose_impuesto_indirecto)
  }

  const formatDesgloseRetencion = () => {
    if (!data.desglose_retencion) return "N/D"
    return JSON.stringify(data.desglose_retencion)
  }

  const fieldMap: Record<string, () => string> = {
    "Numero de Factura": () => data.numero_factura,
    "Serie": () => data.serie,
    "Fecha de Emision": () => data.fecha_emision,
    "Proveedor": () => data.proveedor,
    "CIF/NIF Proveedor": () => data.cif_nif_proveedor,
    "Direccion Proveedor": () => data.direccion_proveedor,
    "Cliente": () => data.cliente,
    "CIF/NIF Cliente": () => data.cif_nif_cliente,
    "Conceptos Facturables": formatConceptos,
    "Base Imponible Total": () => data.base_imponible_total,
    "Tipo Impuesto Indirecto": () => data.tipo_impuesto_indirecto,
    "Desglose Impuesto Indirecto": formatDesgloseImpuesto,
    "Tipo de Retencion": () => data.tipo_retencion,
    "Desglose Retencion": formatDesgloseRetencion,
    "Total Factura": () => data.total_factura,
    "Resumen de la Factura": () => data.resumen_factura,
  }

  for (const field of fields) {
    const getter = fieldMap[field]
    if (getter) {
      result[field] = { value: getter(), confidence: 1 }
    }
  }

  return result
}

function flattenAlbaranData(
  data: z.infer<typeof albaranSchema>,
  fields: string[],
): Record<string, { value: string; confidence: number }> {
  const result: Record<string, { value: string; confidence: number }> = {}

  const formatConceptos = () => {
    if (!data.conceptos_entregados || data.conceptos_entregados.length === 0) return "N/D"
    return JSON.stringify(data.conceptos_entregados)
  }

  const fieldMap: Record<string, () => string> = {
    "Numero de Albaran": () => data.numero_albaran,
    "Fecha de Albaran": () => data.fecha_albaran,
    "Proveedor": () => data.proveedor,
    "CIF/NIF Proveedor": () => data.cif_nif_proveedor,
    "Cliente": () => data.cliente,
    "Referencia Pedido": () => data.referencia_pedido,
    "Conceptos Entregados": formatConceptos,
    "Observaciones": () => data.observaciones,
  }

  for (const field of fields) {
    const getter = fieldMap[field]
    if (getter) {
      result[field] = { value: getter(), confidence: 1 }
    }
  }

  return result
}

// --- Main handler ---

export async function POST(request: NextRequest) {
  try {
    const { markdown, fields, documentType } = await request.json()

    if (!markdown || !fields || !Array.isArray(fields) || !documentType) {
      return NextResponse.json(
        { error: "Markdown, fields array, and document type are required" },
        { status: 400 },
      )
    }

    console.log("[v0] API: Extracting", fields.length, "fields for document type:", documentType)

    const lower = documentType.toLowerCase()
    const isAlbaran = lower.includes("albaran") && !lower.includes("factura")

    let extractedData: Record<string, { value: string; confidence: number }>

    if (isAlbaran) {
      console.log("[v0] API: Using albaran schema")
      const { output } = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        output: Output.object({ schema: albaranSchema }),
        system: ALBARAN_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extrae todos los datos de este albaran:\n\n${markdown}`,
          },
        ],
      })

      if (!output) throw new Error("No extraction output from LLM")
      extractedData = flattenAlbaranData(output, fields)

    } else {
      console.log("[v0] API: Using factura proveedor schema")
      const { output } = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        output: Output.object({ schema: facturaProveedorSchema }),
        system: FACTURA_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extrae todos los datos de esta factura de proveedor:\n\n${markdown}`,
          },
        ],
      })

      if (!output) throw new Error("No extraction output from LLM")
      extractedData = flattenFacturaData(output, fields)
    }

    // Ensure all requested fields have a value
    for (const field of fields) {
      if (!extractedData[field]) {
        extractedData[field] = { value: "N/D", confidence: 1 }
      }
    }

    console.log("[v0] API: All fields extracted successfully")

    return NextResponse.json({ extractedData })
  } catch (error) {
    console.error("[v0] API: Error extracting fields:", error)

    return NextResponse.json(
      {
        error: "Failed to extract fields",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
