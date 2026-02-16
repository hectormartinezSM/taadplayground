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

    // Campos predefinidos para Comprobantes Bancarios
    if (documentType === 'Comprobante Bancario' || documentType.toLowerCase().includes('comprobante')) {
      const fields = [
        'Tipo de Crédito',
        'Institución',
        'Importe de la Cuota',
        'Cuotas Pendientes',
      ];
      fieldsCache.set(documentType, fields);
      return NextResponse.json({ fields });
    }

    // Campos predefinidos para Documentos Identificativos
    if (documentType === 'Documento Identificativo' || documentType.toLowerCase().includes('identificativo') || documentType.toLowerCase().includes('dni') || documentType.toLowerCase().includes('pasaporte')) {
      const fields = [
        'Apellidos',
        'Nombre',
        'Sexo',
        'Nacionalidad',
        'Fecha nacimiento',
        'Estado Civil',
        'Lugar de nacimiento',
        'Ciudad',
        'Provincia',
        'Calle',
        'Número de apartamento',
      ];
      fieldsCache.set(documentType, fields);
      return NextResponse.json({ fields });
    }

    // Para "Otros" no se extraen campos
    console.log('[v0] API: Document type is Otros or unknown, returning empty fields');
    return NextResponse.json({ fields: [] });
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
