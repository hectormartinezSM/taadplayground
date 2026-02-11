import { NextRequest, NextResponse } from 'next/server';

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY;
const API_BASE_URL = 'https://api.va.eu-west-1.landing.ai';

const fieldsCache = new Map<string, string[]>();

interface ExtractResponse {
  extraction: {
    Campos?: string;
  };
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse | null> {
  const formData = new FormData();
  formData.append('markdown', new Blob([markdown], { type: 'text/markdown' }), 'documento.md');
  formData.append('schema', schema);
  formData.append('model', 'extract-latest');

  try {
    const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LANDING_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.log('[v0] API: Extract failed -', response.status, errorBody);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[v0] API: Extract error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { markdown, documentType } = await request.json();

    if (!markdown || !documentType) {
      return NextResponse.json(
        { error: 'Markdown and document type are required' },
        { status: 400 }
      );
    }

    if (fieldsCache.has(documentType)) {
      console.log('[v0] API: Using cached relevant fields for type:', documentType);
      return NextResponse.json({
        fields: fieldsCache.get(documentType),
      });
    }

    console.log('[v0] API: Getting relevant fields for document type:', documentType);

    if (documentType === 'Fotografía') {
      const fields = ['Descripción de la fotografía'];
      fieldsCache.set(documentType, fields);
      return NextResponse.json({ fields });
    }

    // Campos predefinidos para Factura Nacional
    if (documentType === 'Factura Nacional' || 
        (documentType.toLowerCase().includes('factura') && !documentType.toLowerCase().includes('internacional'))) {
      const fields = [
        'Número de Factura',
        'Fecha de Emisión',
        'Fecha de Vencimiento',
        'Periodo de Facturación',
        'Emisor - Razón Social',
        'Emisor - NIF/CIF',
        'Emisor - Dirección',
        'Receptor - Razón Social',
        'Receptor - NIF/CIF',
        'Receptor - Dirección',
        'Conceptos / Líneas de Detalle',
        'Base Imponible',
        'Tipo Impositivo',
        'Porcentaje Impuesto',
        'Cuota Impuesto',
        'Retención IRPF',
        'Total Factura',
        'Total a Percibir',
        'Moneda',
        'Forma de Pago',
        'IBAN / Cuenta Bancaria',
        'Documento Firmado'
      ];
      fieldsCache.set(documentType, fields);
      return NextResponse.json({ fields });
    }

    // Campos predefinidos para Factura Internacional
    if (documentType === 'Factura Internacional' || 
        (documentType.toLowerCase().includes('factura') && documentType.toLowerCase().includes('internacional')) ||
        documentType.toLowerCase().includes('commercial invoice')) {
      const fields = [
        'Invoice Number',
        'Invoice Date',
        'Shipment / Delivery Date',
        'Seller - Company Name',
        'Seller - Tax ID',
        'Seller - Address',
        'Seller - Country',
        'Buyer - Company Name',
        'Buyer - Tax ID',
        'Buyer - Address',
        'Buyer - Country',
        'Delivery Address',
        'Origin',
        'Destination',
        'Incoterm',
        'Conceptos / Líneas de Detalle',
        'Base Amount',
        'Tipo Impositivo',
        'Tax Rate (%)',
        'Tax Amount',
        'Total Amount',
        'Currency',
        'Payment Method',
        'LC / Payment Reference',
        'PO / Proforma Reference',
        'Total in Words',
        'Documento Firmado'
      ];
      fieldsCache.set(documentType, fields);
      return NextResponse.json({ fields });
    }

    const schemaCampos = JSON.stringify({
      properties: {
        Campos: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          default: null,
          description: 'Tienes que identificar la informacion mas relevante en el documento. No tienes que sacar el valor, sino el campo a identificar.Piensa que eres responsable de un banco, aseguradora para plantearte la informacion que te interesaIdentifica los cinco campos más relevantes del documento segun su tipologia documentalDevelveme los campos relevantes separados por ; El nombre de los campos estara siempre en castellano',
          title: 'Campos',
        },
      },
      title: 'CamposRelevantes',
      type: 'object',
    });

    const extCampos = await apiExtract(markdown, schemaCampos);

    let fields: string[] = [];

    if (extCampos && extCampos.extraction && extCampos.extraction.Campos) {
      fields = extCampos.extraction.Campos
        .split(';')
        .map(field => field.trim())
        .filter(field => field.length > 0);
    }

    console.log('[v0] API: Extracted fields:', fields);

    if (fields.length > 0) {
      fieldsCache.set(documentType, fields);
    }

    return NextResponse.json({ fields });
  } catch (error) {
    console.error('[v0] API: Error getting relevant fields:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get relevant fields',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
