// Mock API functions that simulate calls to the Python backend

import { DocumentType, Field, ExtractedField } from './types';

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function mockIsBlankPage(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch('/api/check-blank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.isBlank;
  } catch (error) {
    return false;
  }
}

export async function mockClassifyDocument(imageUrls: string[]): Promise<DocumentType> {
  try {
    const response = await fetch('/api/classify-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrls }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    return { type: data.type, confidence: data.confidence };
  } catch (error) {
    console.error('[v0] Error calling classification API:', error);
    throw new Error(`Document classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function mockGetRelevantFields(documentType: string, markdown: string): Promise<Field[]> {
  try {
    const response = await fetch('/api/get-relevant-fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ markdown, documentType }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.fields.map((fieldName: string) => ({ name: fieldName }));
  } catch (error) {
    console.error('[v0] Error calling relevant fields API:', error);
    throw new Error(`Get relevant fields failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function mockExtractFields(
  imageUrls: string[],
  fields: Field[],
  markdown: string,
  documentType: string
): Promise<Record<string, ExtractedField>> {
  try {
    const response = await fetch('/api/extract-fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        markdown,
        fields: fields.map(f => f.name),
        documentType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[v0] Field extraction API error:', errorData.error);
      throw new Error(`Field extraction failed: ${errorData.error}`);
    }

    const data = await response.json();
    return data.extractedData || {};
  } catch (error) {
    if (error instanceof Error) {
      console.error('[v0] Field extraction error (suppressed from UI):', error.message);
    }
    throw error;
  }
}
