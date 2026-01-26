import { type NextRequest, NextResponse } from "next/server"

console.log("[v0] ===== MOBILE UPLOAD BLOB MODULE LOADED =====")

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Initialize storage
if (typeof globalThis !== "undefined") {
  const globalAny = globalThis as any
  if (!globalAny.mobileSessions) {
    globalAny.mobileSessions = new Map()
    console.log("[v0] Initialized mobile sessions storage in mobile-upload-blob")
  }
}

export async function POST(request: NextRequest) {
  console.log("[v0] ========================================")
  console.log("[v0] MOBILE UPLOAD BLOB ENDPOINT HIT!")
  console.log("[v0] ========================================")

  try {
    const body = await request.json()
    const { sessionId, blobUrl, fileName, fileType, fileSize } = body

    console.log("[v0] Received blob upload - SessionID:", sessionId)
    console.log("[v0] Blob URL:", blobUrl)
    console.log("[v0] File:", fileName, fileSize, fileType)

    if (!sessionId || !blobUrl) {
      console.log("[v0] ERROR: Missing sessionId or blobUrl")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get sessions from global storage
    const globalAny = globalThis as any
    const sessions = globalAny.mobileSessions as Map<string, any>
    const session = sessions.get(sessionId)

    console.log("[v0] Session lookup result:", session ? "FOUND" : "NOT FOUND")
    console.log("[v0] Total sessions in storage:", sessions.size)

    if (!session) {
      console.log("[v0] ERROR: Invalid session ID:", sessionId)
      return NextResponse.json({ error: "Invalid session ID" }, { status: 404 })
    }

    // Update session with blob info
    session.blobUrl = blobUrl
    session.fileName = fileName
    session.fileType = fileType
    session.fileSize = fileSize
    sessions.set(sessionId, session)

    console.log("[v0] SUCCESS: Session updated with blob URL")
    console.log("[v0] ========================================")

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] EXCEPTION in mobile-upload-blob:", error)
    console.error("[v0] Stack:", error.stack)
    console.error("[v0] ========================================")
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
