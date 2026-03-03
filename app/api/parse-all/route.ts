import { NextRequest, NextResponse } from 'next/server';
import { parseCache } from '../check-blank/route';

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY;
const API_BASE_URL = 'https://api.va.eu-west-1.landing.ai';

async function apiParse(imageBase64: string): Promise<string> {
  if (parseCache.has(imageBase64)) {
    return parseCache.get(imageBase64)!;
  }

  if (!LANDING_API_KEY) {
    throw new Error('VISION_AGENT_API_KEY environment variable is not configured');
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  const formData = new FormData();
  formData.append('document', new Blob([buffer]), 'image.jpg');
  formData.append('model', 'dpt-2-20251103');

  const response = await fetch(`${API_BASE_URL}/v1/ade/parse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Parse API failed: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  
  parseCache.set(imageBase64, data.markdown);
  
  return data.markdown;
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls } = await request.json();

    if (!imageUrls || !Array.isArray(imageUrls)) {
      return NextResponse.json(
        { error: 'imageUrls array is required' },
        { status: 400 }
      );
    }

    console.log('[v0] API: Parsing', imageUrls.length, 'pages in parallel...');

    const parsePromises = imageUrls.map(async (imageUrl, index) => {
      try {
        const markdown = await apiParse(imageUrl);
        console.log('[v0] API: Page', index + 1, 'parsed successfully');
        return { index, markdown, success: true };
      } catch (error) {
        console.error('[v0] API: Failed to parse page', index + 1, error);
        return { index, markdown: '', success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    const results = await Promise.all(parsePromises);
    
    console.log('[v0] API: Finished parsing all pages');

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[v0] API: Error parsing pages:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to parse pages',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
