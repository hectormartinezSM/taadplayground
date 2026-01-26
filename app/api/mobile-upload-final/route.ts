import { NextResponse } from "next/server"
import { list, put } from "@vercel/blob"

export const maxDuration = 60
export const bodyParser = {
  sizeLimit: "10mb",
}

export async function POST(request: Request) {
  const timestamp = new Date().toISOString()
  console.log(`\n========== [v0] MOBILE UPLOAD FINAL START ${timestamp} ==========`)

  // Debug environment variables (safe keys only)
  const envKeys = Object.keys(process.env).filter(
    (key) => !key.toLowerCase().includes("secret") && !key.toLowerCase().includes("key"),
  )
  console.log("[v0] Available env vars:", envKeys.join(", "))
  console.log("[v0] Has BLOB_READ_WRITE_TOKEN:", !!process.env.BLOB_READ_WRITE_TOKEN)

  try {
    let body
    try {
      body = await request.json()
      console.log("[v0] Parsed request body:", JSON.stringify(body, null, 2))
    } catch (jsonError) {
      console.error("[v0] JSON parsing failed:", jsonError)
      const text = await request.text()
      console.error("[v0] Raw request body:", text.substring(0, 200))
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }

    const { sessionId, blobUrl, fileName, fileType, fileSize, token: bodyToken } = body

    console.log("[v0] Extracted fields:")
    console.log("  - sessionId:", sessionId)
    console.log("  - blobUrl:", blobUrl)
    console.log("  - fileName:", fileName)
    console.log("  - fileType:", fileType)
    console.log("  - fileSize:", fileSize)
    console.log("  - has bodyToken:", !!bodyToken)

    if (!sessionId || !blobUrl) {
      console.log("[v0] ERROR: Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const token = bodyToken || process.env.BLOB_READ_WRITE_TOKEN
    console.log("[v0] Using token from:", bodyToken ? "request body" : "environment")
    console.log("[v0] Token available:", !!token)

    console.log("[v0] Looking for session in Blob:", sessionId)
    console.log("[v0] File blob URL:", blobUrl)

    console.log("[v0] Searching for session blob with prefix: sessions/" + sessionId + ".json")

    // Find the session file
    const { blobs } = await list({
      prefix: `sessions/${sessionId}.json`,
      limit: 1,
      token: token,
    })

    console.log("[v0] Found blobs:", blobs.length)

    if (blobs.length === 0) {
      console.log("[v0] ERROR: Session blob not found for sessionId:", sessionId)
      return NextResponse.json({ error: "Invalid session ID" }, { status: 404 })
    }

    const sessionBlobUrl = blobs[0].url
    console.log("[v0] Session blob URL:", sessionBlobUrl)

    // Read current data
    console.log("[v0] Fetching current session data...")
    const response = await fetch(sessionBlobUrl)
    if (!response.ok) {
      console.log("[v0] ERROR: Failed to fetch session blob, status:", response.status)
      throw new Error("Failed to read session data")
    }
    const sessionData = await response.json()
    console.log("[v0] Current session data:", JSON.stringify(sessionData, null, 2))

    console.log("[v0] Updating session blob with file URL...")

    // Update data
    const updatedData = {
      ...sessionData,
      blobUrl,
      fileName,
      fileType,
      fileSize,
      status: "ready",
      updatedAt: new Date().toISOString(),
    }

    console.log("[v0] Updated session data:", JSON.stringify(updatedData, null, 2))
    console.log("[v0] Writing to blob: sessions/" + sessionId + ".json")

    // Overwrite the blob
    const putResult = await put(`sessions/${sessionId}.json`, JSON.stringify(updatedData), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      token: token,
      // @ts-ignore - allowOverwrite exists but not in types
      allowOverwrite: true,
    })

    console.log("[v0] Blob write result:", putResult.url)
    console.log("[v0] SUCCESS! Session updated to ready state")
    console.log("========== [v0] MOBILE UPLOAD FINAL END ==========\n")

    return NextResponse.json({ success: true, sessionId })
  } catch (error) {
    console.error("[v0] ERROR in mobile upload final:", error)
    console.log("========== [v0] MOBILE UPLOAD FINAL ERROR END ==========\n")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
