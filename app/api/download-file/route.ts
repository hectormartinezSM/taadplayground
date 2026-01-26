import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get("fileId")

  if (!fileId) {
    return NextResponse.json({ error: "File ID is required" }, { status: 400 })
  }

  if (typeof globalThis !== "undefined" && (globalThis as any).uploadedFiles) {
    const fileData = (globalThis as any).uploadedFiles.get(fileId)
    if (fileData) {
      return NextResponse.json({ dataUrl: fileData })
    }
  }

  return NextResponse.json({ error: "File not found" }, { status: 404 })
}
