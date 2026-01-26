import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

console.log("[v0] ===== UPLOAD TO BLOB MODULE LOADED =====")

export async function POST(request: NextRequest) {
  console.log("[v0] ========== UPLOAD TO BLOB ENDPOINT CALLED ==========")
  console.log("[v0] Request URL:", request.url)
  console.log("[v0] Request method:", request.method)

  try {
    console.log("[v0] Parsing form data...")
    const formData = await request.formData()
    console.log("[v0] Form data keys:", Array.from(formData.keys()))

    const file = formData.get("file") as File
    console.log("[v0] File from form data:", file ? "Found" : "Not found")

    if (!file) {
      console.log("[v0] ERROR: No file provided in form data")
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("[v0] File details:")
    console.log("  - Name:", file.name)
    console.log("  - Size:", file.size, "bytes")
    console.log("  - Type:", file.type)

    console.log("[v0] Starting upload to Vercel Blob...")

    let blob
    try {
      blob = await put(file.name, file, {
        access: "public",
      })
      console.log("[v0] ✓ File uploaded to Blob successfully!")
      console.log("[v0] Blob URL:", blob.url)
    } catch (blobError) {
      console.error("[v0] ✗ Vercel Blob upload failed:", blobError)
      console.error("[v0] Blob error details:", JSON.stringify(blobError, null, 2))
      throw blobError
    }

    const result = {
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
    }
    console.log("[v0] Returning success response:", result)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] ========== UPLOAD TO BLOB ERROR ==========")
    console.error("[v0] Error type:", error instanceof Error ? error.constructor.name : typeof error)
    console.error("[v0] Error message:", error instanceof Error ? error.message : String(error))
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")

    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 })
  }
}
