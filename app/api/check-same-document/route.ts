import { NextRequest, NextResponse } from 'next/server';

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY;
const API_BASE_URL = 'https://api.va.eu-west-1.landing.ai';

interface ParseResponse {
  markdown: string;
}

interface ExtractResponse {
  extraction: {
    same_document?: boolean;
    rationale?: string;
  };
}

const parseCache = new Map<string, string>();

async function apiParse(imageBase64: string): Promise<string> {
  if (parseCache.has(imageBase64)) {
    console.log('[v0] API: Using cached parse result');
    return parseCache.get(imageBase64)!;
  }

  if (!LANDING_API_KEY) {
    throw new Error('VISION_AGENT_API_KEY environment variable is not configured');
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  const formData = new FormData();
  formData.append('document', new Blob([buffer]), 'image.jpg');
  formData.append('model', 'dpt-2-latest');

  const response = await fetch(`${API_BASE_URL}/v1/ade/parse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error(`Authentication failed (401). Error: ${errorBody}`);
    }
    throw new Error(`Parse API failed: ${response.status} - ${errorBody}`);
  }

  const data: ParseResponse = await response.json();
  
  parseCache.set(imageBase64, data.markdown);
  
  return data.markdown;
}

function joinMarkdowns(markdowns: string[]): string {
  let finalText = '';
  
  for (let i = 0; i < markdowns.length; i++) {
    const newText = `# Page ${i + 1}\n\n${markdowns[i]}\n\n ---\n\n`;
    finalText += newText;
  }
  
  return finalText;
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse> {
  const formData = new FormData();
  formData.append('markdown', new Blob([markdown], { type: 'text/markdown' }), 'document.md');
  formData.append('schema', schema);
  formData.append('model', 'extract-latest');

  const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Extract API failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { prevImageUrl, currentImageUrl } = await request.json();

    if (!prevImageUrl || !currentImageUrl) {
      return NextResponse.json(
        { error: 'Both prevImageUrl and currentImageUrl are required' },
        { status: 400 }
      );
    }

    console.log('[v0] API: Checking if pages belong to same document...');

    const markdownPrev = await apiParse(prevImageUrl);
    const markdownCurr = await apiParse(currentImageUrl);
    
    console.log('[v0] API: Both pages parsed');

    const combinedMarkdown = joinMarkdowns([markdownPrev, markdownCurr]);

    const schema = JSON.stringify({
      properties: {
        same_document: {
          description: `You are an expert in document segmentation. Segmentation consists of dividing a multi-page file (1..N pages) into documents: each document is a set of pages that belong to the same entity and form a complete unit, without mixing pages from other documents.

You will receive a single combined Markdown with sections labeled as "# Page 1" and "# Page 2" (transcribed text from each page). Your task is to decide if pages 1 and 2 belong to the same document based on these guidelines:

Key concepts:
- Document Typology: The category of a document, for example, an invoice, receipt, lab report, insurance policy, accident statement, contract, and any other class.
- Semantic continuity: the end of one page is directly linked with the beginning of the next.

Relevant document typologies:
- Lab Report / Medical Report / Pathology Report: Medical laboratory results with patient info, specimen details, diagnosis. Multi-page reports are common.
- Accident Statement: Official accident report with driver details, insurance info, damage descriptions. Usually 2+ pages.
- Insurance Invoice / Insurance Policy: Insurance documents with premiums, policy numbers, coverage details.
- Sales Receipt / Receipt: Purchase receipts with items, totals, payment info. Usually single page.
- Invoice: Commercial invoice with line items, amounts, sender/recipient. Can be multi-page.
- Contract: Legal agreement between parties. Often multi-page.
- Identity Document: ID card, passport, driver license. Usually single page (front/back).
- Payslip: Salary details with deductions. Usually 1-2 pages.
- Tax Form / Tax Return: Government tax documents. Can be multi-page.
- Bank Statement: Account transactions. Often multi-page.
- Certificate: Official certification document. Usually single page.
- Legal Document: Court orders, summons, legal filings. Can be multi-page.
- Letter / Correspondence: Business or personal letters.
- Medical Certificate / Prescription: Healthcare documents.
- Property Deed / Mortgage: Real estate documents. Often multi-page.

Guidelines:
1. If both pages have the same document typology AND show semantic continuity (e.g., continued tables, same reference numbers, sequential page numbers), they belong to the SAME document -> true.
2. If the pages have different typologies (e.g., page 1 is an invoice, page 2 is a receipt), they are DIFFERENT documents -> false.
3. If same typology but different entities (e.g., two different invoices from different companies), they are DIFFERENT documents -> false.
4. When in doubt, lean towards true (same document) for pages with the same format and entity.`,
          title: 'Same Document',
          type: 'boolean',
        },
        rationale: {
          description: 'Brief justification of the decision (1-2 sentences)',
          title: 'Rationale',
          type: 'string',
        },
      },
      required: ['same_document', 'rationale'],
      title: 'SameDocVerdict',
      type: 'object',
    });

    const extractResult = await apiExtract(combinedMarkdown, schema);
    
    console.log('[v0] API: Extraction result:', extractResult);

    let sameDocument = true;
    
    if (extractResult.extraction && 'same_document' in extractResult.extraction) {
      const same = extractResult.extraction.same_document;
      if (same !== undefined && same !== null) {
        sameDocument = same;
      }
    }

    console.log('[v0] API: Pages belong to same document:', sameDocument);

    return NextResponse.json({ sameDocument });
  } catch (error) {
    console.error('[v0] API: Error checking same document:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check if pages belong to same document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
