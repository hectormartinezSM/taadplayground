import { type NextRequest, NextResponse } from "next/server"

// Hardcoded field definitions per document type matching the spec exactly

const FACTURA_PROVEEDOR_FIELDS = [
  "Numero de Factura",
  "Serie",
  "Fecha de Emision",
  "Proveedor",
  "CIF/NIF Proveedor",
  "Direccion Proveedor",
  "Cliente",
  "CIF/NIF Cliente",
  "Conceptos Facturables",
  "Base Imponible Total",
  "Desglose Impuesto Indirecto",
  "Total Factura",
  "Resumen de Factura, Concepto",
  "Forma de Pago",
  "Numero de Cuenta",
]

const ALBARAN_FIELDS = [
  "Numero de Albaran",
  "Fecha de Albaran",
  "Proveedor",
  "CIF/NIF Proveedor",
  "Cliente",
  "Referencia Pedido",
  "Conceptos Entregados",
  "Observaciones",
]

function getFieldsForType(documentType: string): string[] {
  const lower = documentType.toLowerCase()

  if (lower.includes("albaran") && !lower.includes("factura")) {
    return [...ALBARAN_FIELDS]
  }

  // Default to factura proveedor
  return [...FACTURA_PROVEEDOR_FIELDS]
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
