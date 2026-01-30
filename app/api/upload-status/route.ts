import { NextResponse } from "next/server"
import { list, head } from "@vercel/blob"
import { retryWithBackoff } from "@/lib/api-retry"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")

  console.log(`[v0] STATUS CHECK for session: ${sessionId}`)

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 })
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      console.log("[v0] No BLOB token, returning waiting")
      return NextResponse.json({ status: "waiting" })
    }

    const { blobs } = await retryWithBackoff(async () => {
      const result = await list({
        prefix: `sessions/${sessionId}.json`,
        limit: 1,
        token: token,
      })

      if (!result) {
        throw new Error("Blob API rate limit or error")
      }

      return result
    })

    if (blobs.length === 0) {
      console.log("[v0] Session blob not found")
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Use the main url property - it's publicly accessible for read
    const blobUrl = blobs[0].url
    console.log(`[v0] Fetching blob from: ${blobUrl}`)
    
    let data
    try {
      const response = await fetch(blobUrl, {
        cache: 'no-store',
      })
      if (!response.ok) {
        console.log(`[v0] Blob fetch failed with status: ${response.status}`)
        // Return waiting instead of throwing - the session may not be ready
        return NextResponse.json({ status: "waiting" })
      }
      data = await response.json()
    } catch (fetchError) {
      console.log(`[v0] Blob fetch error:`, fetchError)
      return NextResponse.json({ status: "waiting" })
    }

    console.log(`[v0] Session data status: ${data.status || "undefined"}, has blobUrl: ${!!data.blobUrl}`)

    if (data.blobUrl) {
      console.log(`[v0] File ready! Returning file info`)
      return NextResponse.json({
        status: "ready",
        fileInfo: {
          blobUrl: data.blobUrl,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
        },
      })
    }

    console.log("[v0] Status: waiting (no blobUrl in session data)")
    return NextResponse.json({ status: "waiting" })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    if (!errorMessage.includes("Rate limit") && !errorMessage.includes("Too Many")) {
      console.error("[v0] Error checking status:", error)
    }
    return NextResponse.json({ status: "waiting" })
  }
}
