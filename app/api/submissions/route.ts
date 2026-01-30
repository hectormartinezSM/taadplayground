import { NextResponse } from 'next/server'
import { saveSubmission, getSubmissions } from '@/lib/submissions'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    
    const submissions = await getSubmissions(limit, offset)
    
    return NextResponse.json({ submissions })
  } catch (error) {
    console.error('[v0] Error fetching submissions:', error)
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    const submission = await saveSubmission({
      documents: body.documents,
      totalPages: body.totalPages,
      status: body.status || 'completed',
    })
    
    return NextResponse.json({ submission })
  } catch (error) {
    console.error('[v0] Error saving submission:', error)
    return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
  }
}
