import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('[v0] API: Starting PDF to images conversion');
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('[v0] API: Processing file:', file.name, 'Size:', file.size);
    
    // Read PDF as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Extract number of pages by counting page objects
    const pdfText = buffer.toString('latin1');
    const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g);
    const numPages = pageMatches ? pageMatches.length : 1;
    
    console.log('[v0] API: Detected', numPages, 'pages in PDF');
    
    // For now, return the page count and we'll render on client side
    // This avoids server-side rendering issues
    return NextResponse.json({
      success: true,
      numPages,
      fileName: file.name,
      fileSize: file.size
    });
    
  } catch (error) {
    console.error('[v0] API: Error processing PDF:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
