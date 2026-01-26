import { NextResponse } from "next/server"
import { list, put } from "@vercel/blob"

export const maxDuration = 60 // Allow longer execution for Blob operations

export async function POST(request: Request) {
  console.log("[v0] MOBILE RECEIVE POST ENDPOINT CALLED")

  try {
    const body = await request.json()
    const { sessionId, base64, fileName, fileType, fileSize } = body

    if (!sessionId || !base64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Check for token
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      console.error("[v0] CRITICAL: BLOB_READ_WRITE_TOKEN is missing in mobile-receive")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    console.log("[v0] Looking for session in Blob:", sessionId)

    // Find the session file
    const { blobs } = await list({
      prefix: `sessions/${sessionId}.json`,
      limit: 1,
      token: token,
    })

    if (blobs.length === 0) {
      console.log("[v0] Session blob not found")
      return NextResponse.json({ error: "Invalid session ID" }, { status: 404 })
    }

    const blobUrl = blobs[0].url

    // Read current data
    const response = await fetch(blobUrl)
    if (!response.ok) {
      throw new Error("Failed to read session data")
    }
    const sessionData = await response.json()

    console.log("[v0] Updating session blob with file data...")

    // Update data
    const updatedData = {
      ...sessionData,
      base64, // Store base64 directly in JSON
      fileName,
      fileType,
      fileSize,
      status: "ready",
      updatedAt: new Date().toISOString(),
    }

    // Overwrite the blob
    await put(`sessions/${sessionId}.json`, JSON.stringify(updatedData), {
      access: "public",
      addRandomSuffix: false,
      token: token,
    })

    console.log("[v0] SUCCESS! Session blob updated")

    return NextResponse.json({ success: true, sessionId })
  } catch (error) {
    console.error("[v0] ERROR in mobile receive:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
