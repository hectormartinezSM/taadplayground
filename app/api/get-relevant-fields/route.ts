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
  "Concepto",
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
  "Base Imponible Total",
  "Desglose Impuesto Indirecto",
  "Total Albaran",
]

const CONVENIO_FIELDS = [
  "Titulo del Convenio",
  "Fecha de Firma",
  "Lugar de Firma",
  "Resumen del Objetivo",
  "Partes Firmantes",
  "Importe Colaboracion",
  "Fecha Inicio Vigencia",
  "Fecha Fin Vigencia",
  "Prorroga Automatica",
  "Clausula Confidencialidad",
  "Clausula Proteccion Datos",
  "Clausula Propiedad Intelectual",
  "Clausula Cumplimiento Normativo",
  "Clausula Resolucion Anticipada",
  "Numero Firmantes Detectados",
  "Detalle Firmantes",
]

const RECIBI_FIELDS = [
  "Numero Recibi",
  "Fecha Recibi",
  "Pagador",
  "CIF Pagador",
  "Perceptor",
  "NIF Perceptor",
  "Resumen Concepto",
  "Conceptos",
  "Subtotal Bruto",
  "Tipo Retencion",
  "Porcentaje Retencion",
  "Importe Retencion",
  "Total a Percibir",
  "IBAN Destino",
  "Firmado",
  "Fecha Firma",
]

function getFieldsForType(documentType: string): string[] {
  const lower = documentType.toLowerCase()

  if (lower.includes("albaran") && !lower.includes("factura")) {
    return [...ALBARAN_FIELDS]
  }

  if (lower.includes("convenio")) {
    return [...CONVENIO_FIELDS]
  }

  if (lower.includes("recibi") || lower.includes("recibí")) {
    return [...RECIBI_FIELDS]
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
