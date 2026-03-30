import { NextResponse } from "next/server";
import { generateChatResponse } from "@/lib/mikrotik/chat-engine";
import { analyzeRsc } from "@/lib/mikrotik/analyzer";

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const response = generateChatResponse(message);
    return NextResponse.json({ response });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { content, filename } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const result = analyzeRsc(content, filename || "config.rsc");
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
