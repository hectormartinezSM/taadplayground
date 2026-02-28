import { NextRequest, NextResponse } from 'next/server';

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY;
const API_BASE_URL = 'https://api.va.eu-west-1.landing.ai';

const fieldsCache = new Map<string, string[]>();

interface ExtractResponse {
  extraction: {
    Fields?: string;
  };
}

// Hardcoded field definitions for key demo document types
const HARDCODED_FIELDS: Record<string, string[]> = {
  'Lab Report': [
    'Patient Name',
    'Date of Birth',
    'Sex',
    'Pathology Number',
    'Date Obtained',
    'Date Received',
    'Specimen Type',
    'Diagnosis',
    'Performing Physician',
  ],
  'Medical Report': [
    'Patient Name',
    'Date of Birth',
    'Sex',
    'Report Date',
    'Diagnosis',
    'Treating Physician',
    'Hospital/Clinic',
    'Medical Record Number',
  ],
  'Pathology Report': [
    'Patient Name',
    'Date of Birth',
    'Pathology Number',
    'Date Obtained',
    'Specimen Type',
    'Diagnosis',
    'Performing Physician',
  ],
  'Accident Statement': [
    'Date of Accident',
    'Location of Accident',
    'Vehicle A Driver',
    'Vehicle A Insurance Company',
    'Vehicle A Policy Number',
    'Vehicle B Driver',
    'Vehicle B Insurance Company',
    'Vehicle B Policy Number',
    'Description of Damage',
  ],
  'Insurance Invoice': [
    'Insurance Company',
    'Account Number',
    'Invoice Number',
    'Policyholder Name',
    'Policyholder Address',
    'Effective Period',
    'Audited Premium Total',
    'Balance Due',
  ],
  'Insurance Policy': [
    'Insurance Company',
    'Policy Number',
    'Policyholder Name',
    'Coverage Type',
    'Effective Date',
    'Expiration Date',
    'Premium Amount',
    'Deductible',
  ],
  'Insurance Claim': [
    'Claim Number',
    'Policy Number',
    'Claimant Name',
    'Date of Loss',
    'Description of Loss',
    'Claim Amount',
    'Insurance Company',
  ],
  'Sales Receipt': [
    'Store Name',
    'Date',
    'Items Purchased',
    'Subtotal',
    'Discounts',
    'Total Amount',
    'Payment Method',
    'Change Given',
  ],
  'Receipt': [
    'Issuer',
    'Date',
    'Items/Description',
    'Subtotal',
    'Tax',
    'Total Amount',
    'Payment Method',
  ],
  'Invoice': [
    'Invoice Number',
    'Issue Date',
    'Due Date',
    'Issuer Name',
    'Issuer Address',
    'Recipient Name',
    'Total Amount',
    'Tax Amount',
  ],
  'Contract': [
    'Contract Type',
    'Parties Involved',
    'Effective Date',
    'Expiration Date',
    'Key Terms',
    'Signatures',
  ],
  'Photograph': [
    'Photo Description',
  ],
};

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse | null> {
  const formData = new FormData();
  formData.append('markdown', new Blob([markdown], { type: 'text/markdown' }), 'document.md');
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

    // Check hardcoded fields first (exact match)
    if (HARDCODED_FIELDS[documentType]) {
      const fields = HARDCODED_FIELDS[documentType];
      fieldsCache.set(documentType, fields);
      console.log('[v0] API: Using hardcoded fields for type:', documentType);
      return NextResponse.json({ fields });
    }

    // Check hardcoded fields (partial match - case insensitive)
    const lowerType = documentType.toLowerCase();
    for (const [key, fields] of Object.entries(HARDCODED_FIELDS)) {
      if (lowerType.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerType)) {
        fieldsCache.set(documentType, fields);
        console.log('[v0] API: Using hardcoded fields (partial match) for type:', documentType, '-> matched:', key);
        return NextResponse.json({ fields });
      }
    }

    // Fallback: use AI to detect fields
    const schemaFields = JSON.stringify({
      properties: {
        Fields: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          default: null,
          description: 'You must identify the most relevant information in the document. You do not need to extract the value, only the field name to identify. Think as if you are responsible at a bank, insurance company, or corporation and consider what information would be most important. Identify the five to eight most relevant fields of the document based on its document type. Return the relevant field names separated by ; Field names must always be in English.',
          title: 'Fields',
        },
      },
      title: 'RelevantFields',
      type: 'object',
    });

    const extFields = await apiExtract(markdown, schemaFields);

    let fields: string[] = [];

    if (extFields && extFields.extraction && extFields.extraction.Fields) {
      fields = extFields.extraction.Fields
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
