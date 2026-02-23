import { type NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"

// --- Zod Schemas ---

const facturaSchema = z.object({
  grupo_impuestos: z.string().describe("Tipo de impuesto aplicado: 'IVA 21%', 'IVA 10%', 'IVA 4%', 'Exento', etc."),
  grupo_proveedores: z.string().describe("Nombre del proveedor/emisor de la factura"),
  nif_cif: z.string().describe("NIF o CIF del emisor. Si esta tachado u oscurecido, devolver 'Dato Anonimizado en Origen'"),
  forma_pago: z.string().describe("Forma de pago: 'Transferencia', 'Recibo', 'Domiciliacion', etc."),
  cuenta_abono: z.string().describe("IBAN o cuenta bancaria. Si esta tachado u oscurecido, devolver 'Dato Anonimizado en Origen'"),
  articulos: z.array(z.object({
    descripcion: z.string().describe("Nombre/descripcion del producto o servicio"),
    cantidad: z.string().nullable().describe("Cantidad, si aplica"),
    precio_unitario: z.string().nullable().describe("Precio unitario con formato XX.XXX,XX EUR"),
    importe: z.string().nullable().describe("Importe de la linea con formato XX.XXX,XX EUR"),
  })).describe("Lista de articulos/servicios facturados. Puede haber uno o varios."),
  concepto: z.string().describe("Resumen general del concepto de la factura en una frase corta"),
  importe_total: z.string().describe("Importe total de la factura con formato XX.XXX,XX EUR"),
  numero_factura: z.string().describe("Numero de factura tal como aparece en el documento, SIN espacios"),
  fecha_documento: z.string().describe("Fecha de la factura en formato DD/MM/AAAA"),
  fecha_registro: z.string().describe("Fecha de registro (igual a fecha de factura) en formato DD/MM/AAAA"),
  fecha_vencimiento: z.string().nullable().describe("Fecha de vencimiento en formato DD/MM/AAAA, o null si no aparece"),
  datos_anonimizados: z.array(z.string()).describe("Lista de nombres de campos cuyo valor esta tachado/oscurecido en el documento original"),
})

const facturaConAlbaranSchema = facturaSchema.extend({
  albaranes: z.array(z.object({
    numero: z.string().describe("Numero del albaran"),
    fecha: z.string().describe("Fecha del albaran en formato DD/MM/AAAA"),
    lineas: z.array(z.object({
      descripcion: z.string().describe("Descripcion del producto/servicio"),
      cantidad: z.string().describe("Cantidad"),
      precio_unitario: z.string().describe("Precio unitario con formato XX.XXX,XX EUR"),
      importe: z.string().describe("Importe de la linea con formato XX.XXX,XX EUR"),
    })).describe("Lineas de detalle del albaran"),
  })).describe("Albaranes asociados a la factura con su desglose"),
})

const otroDocumentoSchema = z.object({
  tipo_documento: z.string().describe("Tipo especifico del documento: 'Convenio', 'Contrato', 'Acuerdo Marco', etc."),
  partes_involucradas: z.string().describe("Partes que intervienen, separadas por ' | '"),
  objeto_descripcion: z.string().describe("Objeto o descripcion resumida del documento en 1-2 frases"),
  importe_total: z.string().nullable().describe("Importe total si existe, con formato XX.XXX,XX EUR"),
  forma_pago: z.string().nullable().describe("Forma de pago si se especifica"),
  cuenta_abono: z.string().nullable().describe("Cuenta bancaria si aparece. Si esta tachada, 'Dato Anonimizado en Origen'"),
  fechas_clave: z.string().describe("Fechas importantes separadas por ' | '. Formato: 'Descripcion: DD/MM/AAAA'"),
  personas_clave: z.string().describe("Personas relevantes separadas por ' | '. Formato: 'Nombre - Cargo/Rol'"),
  duracion_vigencia: z.string().nullable().describe("Duracion o vigencia del documento"),
  datos_anonimizados: z.array(z.string()).describe("Lista de nombres de campos cuyo valor esta tachado/oscurecido"),
})

// --- System prompts ---

const FACTURA_SYSTEM_PROMPT = `Eres un agente extractor de datos de facturas para Fundacion IberCaja. Tu tarea es extraer con precision todos los campos solicitados de facturas.

REGLAS OBLIGATORIAS:

1. FORMATO DE FECHAS: DD/MM/AAAA (ejemplo: 31/12/2025)
2. FORMATO DE IMPORTES: XX.XXX,XX EUR (separador miles: punto, decimal: coma, moneda: EUR)
3. NUMERO DE FACTURA: Exactamente como aparece en el documento, SIN espacios ni caracteres adicionales.
4. DATOS ANONIMIZADOS: Si un campo esta tachado con una caja negra, oscurecido, o es ilegible por anonimizacion, el valor del campo debe ser "Dato Anonimizado en Origen" y ademas debes incluir el nombre del campo en la lista datos_anonimizados.
5. ARTICULOS: Extrae TODOS los productos/servicios facturados como elementos individuales del array.
6. GRUPO DE IMPUESTOS: Indica el tipo y porcentaje (ej: "IVA 21%", "IVA 10%", "Exento").
7. CONCEPTO: Resume el concepto general de la factura en una frase corta y clara.
8. Si un campo no existe en el documento y NO esta anonimizado, usa "N/D".`

const FACTURA_ALBARAN_SYSTEM_PROMPT = `${FACTURA_SYSTEM_PROMPT}

REGLAS ADICIONALES PARA FACTURAS CON ALBARAN:
9. ALBARANES: Extrae TODOS los albaranes referenciados, con su numero, fecha, y TODAS las lineas de detalle de cada uno.
10. Si la factura consolida varios albaranes, desglosarlos individualmente.
11. Para cada linea de albaran, extrae: descripcion, cantidad, precio unitario e importe.`

const OTRO_DOCUMENTO_SYSTEM_PROMPT = `Eres un agente extractor de datos de documentos para Fundacion IberCaja. Tu tarea es extraer la informacion mas relevante de documentos como convenios, contratos, acuerdos y otros.

REGLAS OBLIGATORIAS:

1. FORMATO DE FECHAS: DD/MM/AAAA
2. FORMATO DE IMPORTES: XX.XXX,XX EUR
3. DATOS ANONIMIZADOS: Si un campo esta tachado/oscurecido, el valor debe ser "Dato Anonimizado en Origen".
4. PARTES: Lista todas las partes que firman o intervienen, separadas por " | ".
5. PERSONAS CLAVE: Formato "Nombre Apellidos - Cargo/Rol", separadas por " | ".
6. FECHAS CLAVE: Formato "Descripcion: DD/MM/AAAA", separadas por " | ".
7. Se conciso y directo. Sin explicaciones largas.
8. Si un campo no aplica, usa "N/D".`

// --- Flattening functions ---

function flattenFacturaData(
  data: z.infer<typeof facturaSchema>,
  fields: string[],
): Record<string, { value: string; confidence: number }> {
  const result: Record<string, { value: string; confidence: number }> = {}

  const fieldMap: Record<string, () => string> = {
    "Grupo de Impuestos": () => data.grupo_impuestos,
    "Grupo de Proveedores": () => data.grupo_proveedores,
    "NIF/CIF": () => data.nif_cif,
    "Forma de Pago": () => data.forma_pago,
    "Cuenta de Abono": () => data.cuenta_abono,
    "Articulo(s)": () => {
      if (data.articulos.length === 0) return "N/D"
      return data.articulos
        .map((a) => {
          const parts = [a.descripcion]
          if (a.cantidad) parts.push(a.cantidad)
          if (a.precio_unitario) parts.push(a.precio_unitario)
          if (a.importe) parts.push(a.importe)
          return parts.join("; ")
        })
        .join(" | ")
    },
    "Concepto": () => data.concepto,
    "Importe Total": () => data.importe_total,
    "Numero de Factura": () => data.numero_factura,
    "Fecha de Documento": () => data.fecha_documento,
    "Fecha de Registro": () => data.fecha_registro,
    "Fecha de Vencimiento": () => data.fecha_vencimiento || "N/D",
  }

  for (const field of fields) {
    const getter = fieldMap[field]
    if (getter) {
      result[field] = { value: getter(), confidence: 1 }
    }
  }

  return result
}

function flattenFacturaConAlbaranData(
  data: z.infer<typeof facturaConAlbaranSchema>,
  fields: string[],
): Record<string, { value: string; confidence: number }> {
  // First, get all base factura fields
  const result = flattenFacturaData(data, fields)

  // Flatten albaranes
  if (fields.includes("Albaranes Asociados") && data.albaranes) {
    const albaranesStr = data.albaranes
      .map((a) => `N ${a.numero} (${a.fecha})`)
      .join(" | ")
    result["Albaranes Asociados"] = { value: albaranesStr || "N/D", confidence: 1 }
  }

  if (fields.includes("Detalle por Albaran") && data.albaranes) {
    const detalleLines: string[] = []
    for (const albaran of data.albaranes) {
      detalleLines.push(`--- Albaran ${albaran.numero} (${albaran.fecha}) ---`)
      for (const linea of albaran.lineas) {
        detalleLines.push(`${linea.descripcion}; ${linea.cantidad}; ${linea.precio_unitario}; ${linea.importe}`)
      }
    }
    result["Detalle por Albaran"] = { value: detalleLines.join(" | ") || "N/D", confidence: 1 }
  }

  return result
}

function flattenOtroDocumentoData(
  data: z.infer<typeof otroDocumentoSchema>,
  fields: string[],
): Record<string, { value: string; confidence: number }> {
  const result: Record<string, { value: string; confidence: number }> = {}

  const fieldMap: Record<string, () => string> = {
    "Tipo de Documento": () => data.tipo_documento,
    "Partes Involucradas": () => data.partes_involucradas,
    "Objeto / Descripcion": () => data.objeto_descripcion,
    "Importe Total": () => data.importe_total || "N/D",
    "Forma de Pago": () => data.forma_pago || "N/D",
    "Cuenta de Abono": () => data.cuenta_abono || "N/D",
    "Fechas Clave": () => data.fechas_clave,
    "Personas Clave": () => data.personas_clave,
    "Duracion / Vigencia": () => data.duracion_vigencia || "N/D",
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
    const isFacturaConAlbaran = lower.includes("albaran")
    const isFactura = isFacturaConAlbaran || lower.includes("factura") || lower.includes("intragrupo")

    let extractedData: Record<string, { value: string; confidence: number }>

    if (isFacturaConAlbaran) {
      console.log("[v0] API: Using factura con albaran schema")
      const { output } = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        output: Output.object({ schema: facturaConAlbaranSchema }),
        system: FACTURA_ALBARAN_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extrae todos los datos de esta factura con albaranes:\n\n${markdown}`,
          },
        ],
      })

      if (!output) throw new Error("No extraction output from LLM")
      extractedData = flattenFacturaConAlbaranData(output, fields)

    } else if (isFactura) {
      console.log("[v0] API: Using factura intragrupo schema")
      const { output } = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        output: Output.object({ schema: facturaSchema }),
        system: FACTURA_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extrae todos los datos de esta factura:\n\n${markdown}`,
          },
        ],
      })

      if (!output) throw new Error("No extraction output from LLM")
      extractedData = flattenFacturaData(output, fields)

    } else {
      console.log("[v0] API: Using otro documento schema")
      const { output } = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        output: Output.object({ schema: otroDocumentoSchema }),
        system: OTRO_DOCUMENTO_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extrae los datos mas relevantes de este documento:\n\n${markdown}`,
          },
        ],
      })

      if (!output) throw new Error("No extraction output from LLM")
      extractedData = flattenOtroDocumentoData(output, fields)
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
