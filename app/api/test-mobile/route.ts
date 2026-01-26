import { NextResponse } from "next/server"

export async function GET() {
  console.log("[v0] ===== TEST ENDPOINT CALLED - GET =====")
  return NextResponse.json({ message: "Test endpoint works!", timestamp: new Date().toISOString() })
}

export async function POST() {
  console.log("[v0] ===== TEST ENDPOINT CALLED - POST =====")
  return NextResponse.json({ message: "Test POST works!", timestamp: new Date().toISOString() })
}
