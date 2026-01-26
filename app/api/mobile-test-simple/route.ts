import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  console.log("[v0] Mobile test endpoint called via GET")
  return NextResponse.json({ status: "ok", message: "Mobile can reach the server!" })
}

export async function POST() {
  console.log("[v0] Mobile test endpoint called via POST")
  return NextResponse.json({ status: "ok", message: "Mobile POST works!" })
}
