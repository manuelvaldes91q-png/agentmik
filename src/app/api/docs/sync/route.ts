import { NextResponse } from "next/server";
import { MikroTikCrawler } from "@/lib/ingestion/crawler";
import { getVectorStore } from "@/lib/ingestion/vector-store";

export async function POST() {
  try {
    const crawler = new MikroTikCrawler({ delayMs: 1500, maxRetries: 3 });

    const { documents, chunks, allChunks } = await crawler.sync();

    const vectorStore = getVectorStore();

    if (allChunks.length > 0) {
      vectorStore.indexChunks(allChunks);
      vectorStore.setLastSync(new Date().toISOString());
    }

    const stats = vectorStore.getStats();

    return NextResponse.json({
      success: true,
      documents,
      chunks: stats.totalChunks,
      categories: stats.categories,
      lastSync: stats.lastSync,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Documentation sync failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const vectorStore = getVectorStore();
    const stats = vectorStore.getStats();

    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to get sync status" },
      { status: 500 }
    );
  }
}
