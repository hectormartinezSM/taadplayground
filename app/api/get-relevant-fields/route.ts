import { type NextRequest, NextResponse } from "next/server"

// Hardcoded field definitions per document type - no LLM needed here

const FACTURA_FIELDS = [
  "Grupo de Impuestos",
  "Grupo de Proveedores",
  "NIF/CIF",
  "Forma de Pago",
  "Cuenta de Abono",
  "Articulo(s)",
  "Concepto",
  "Importe Total",
  "Numero de Factura",
  "Fecha de Documento",
  "Fecha de Registro",
  "Fecha de Vencimiento",
]

const FACTURA_CON_ALBARAN_EXTRA_FIELDS = [
  "Albaranes Asociados",
  "Detalle por Albaran",
]

const OTRO_DOCUMENTO_FIELDS = [
  "Tipo de Documento",
  "Partes Involucradas",
  "Objeto / Descripcion",
  "Importe Total",
  "Forma de Pago",
  "Cuenta de Abono",
  "Fechas Clave",
  "Personas Clave",
  "Duracion / Vigencia",
]

function getFieldsForType(documentType: string): string[] {
  const lower = documentType.toLowerCase()

  if (lower.includes("albaran") || lower === "factura con albaran") {
    return [...FACTURA_FIELDS, ...FACTURA_CON_ALBARAN_EXTRA_FIELDS]
  }

  if (lower.includes("factura") || lower.includes("intragrupo")) {
    return [...FACTURA_FIELDS]
  }

  // Convenios, contratos, and any other document type
  return [...OTRO_DOCUMENTO_FIELDS]
}

export async function POST(request: NextRequest) {
  try {
    const { documentType } = await request.json()

    if (!documentType) {
      return NextResponse.json(
        { error: "Document type is required" },
        { status: 400 },
      )
    }

    console.log("[v0] API: Getting relevant fields for document type:", documentType)

    const fields = getFieldsForType(documentType)

    console.log("[v0] API: Returning", fields.length, "fields for type:", documentType)

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
