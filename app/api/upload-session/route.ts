import { NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function POST(request: Request) {
  console.log("[v0] Upload session POST endpoint called")

  try {
    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`

    const sessionData = {
      sessionId,
      createdAt: new Date().toISOString(),
      status: "waiting",
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN

    console.log("[v0] Has BLOB_READ_WRITE_TOKEN:", !!token)

    if (!token) {
      console.error("[v0] CRITICAL: BLOB_READ_WRITE_TOKEN is missing")
      return NextResponse.json({ error: "Server configuration error: Missing Blob token" }, { status: 500 })
    }

    console.log("[v0] Creating session in Blob storage:", sessionId)

    let blobResult
    try {
      blobResult = await put(`sessions/${sessionId}.json`, JSON.stringify(sessionData), {
        access: "public",
        addRandomSuffix: false,
        token: token,
      })
    } catch (blobError: any) {
      console.error("[v0] Blob API error:", blobError)

      if (blobError.message?.includes("Too Many Requests") || blobError.message?.includes("429")) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded. Please try again in a few moments.",
          },
          { status: 429 },
        )
      }

      return NextResponse.json(
        {
          error: "Failed to store session data. Please try again.",
        },
        { status: 500 },
      )
    }

    const publicUrl = process.env.NEXT_PUBLIC_APP_URL
    const url = new URL(request.url)
    const baseUrl = publicUrl || `${url.protocol}//${url.host}`

    console.log("[v0] Using baseUrl for QR:", baseUrl)

    return NextResponse.json({
      sessionId,
      baseUrl,
      token,
    })
  } catch (error: any) {
    console.error("[v0] Error creating session:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to create session",
      },
      { status: 500 },
    )
  }
}
