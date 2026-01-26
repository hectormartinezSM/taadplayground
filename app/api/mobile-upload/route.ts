import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  console.log("[v0] MOBILE UPLOAD API CALLED")

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const sessionId = formData.get("sessionId") as string

    console.log("[v0] Session:", sessionId, "File:", file?.name, file?.size, "bytes")

    if (!sessionId || !file) {
      console.log("[v0] Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const serverToken = process.env.BLOB_READ_WRITE_TOKEN
    if (!serverToken) {
      console.error("[v0] Server missing BLOB_READ_WRITE_TOKEN")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    // Upload file to Blob
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 9)
    const fileExt = file.name.split(".").pop() || "pdf"
    const blobFileName = `mobile-uploads/${sessionId}-${timestamp}-${randomId}.${fileExt}`

    console.log("[v0] Uploading to blob:", blobFileName)

    const blob = await put(blobFileName, file, {
      access: "public",
      token: serverToken,
    })

    console.log("[v0] File uploaded successfully:", blob.url)

    // Update session in Blob storage
    const sessionBlobName = `sessions/${sessionId}.json`
    const sessionData = {
      status: "uploaded",
      blobUrl: blob.url,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    }

    console.log("[v0] Updating session:", sessionBlobName)

    await put(sessionBlobName, JSON.stringify(sessionData), {
      access: "public",
      token: serverToken,
      contentType: "application/json",
    })

    console.log("[v0] Session updated - mobile upload complete!")

    return NextResponse.json({ success: true, blobUrl: blob.url })
  } catch (error: any) {
    console.error("[v0] Mobile upload fatal error:", error.message, error.stack)
    return NextResponse.json({ error: "Upload failed", details: error.message }, { status: 500 })
  }
}
