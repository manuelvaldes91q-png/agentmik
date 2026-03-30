import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "MikroTik Expert Sentinel",
    version: "1.0.0",
    knowledgeBase: 19,
    timestamp: new Date().toISOString(),
  });
}
