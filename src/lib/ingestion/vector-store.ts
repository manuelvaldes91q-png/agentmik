import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { DocumentChunk } from "./crawler";

// Vector store uses Map<string, number> for term frequencies

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

export class VectorStore {
  private db: Database.Database;
  private vectorIndex: Map<string, Map<string, number>> = new Map();
  private idfCache: Map<string, number> | null = null;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ||
      path.join(process.cwd(), "data", "mikrotik-vector-store.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_chunks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        section TEXT NOT NULL,
        text TEXT NOT NULL,
        code_examples TEXT NOT NULL,
        url TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_category ON doc_chunks(category);
      CREATE INDEX IF NOT EXISTS idx_chunks_url ON doc_chunks(url);
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.loadVectorIndex();
  }

  private loadVectorIndex(): void {
    const rows = this.db
      .prepare("SELECT id, text, code_examples FROM doc_chunks")
      .all() as Array<{ id: string; text: string; code_examples: string }>;

    this.vectorIndex.clear();
    this.idfCache = null;

    for (const row of rows) {
      const fullText =
        row.text +
        " " +
        (JSON.parse(row.code_examples) as string[]).join(" ");
      this.vectorIndex.set(row.id, this.computeTf(fullText));
    }
  }

  indexChunks(chunks: DocumentChunk[]): void {
    const clearStmt = this.db.prepare("DELETE FROM doc_chunks");
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO doc_chunks (id, title, section, text, code_examples, url, category)
      VALUES (@id, @title, @section, @text, @codeExamples, @url, @category)
    `);

    const transaction = this.db.transaction((items: DocumentChunk[]) => {
      clearStmt.run();
      this.vectorIndex.clear();
      this.idfCache = null;

      for (const chunk of items) {
        insertStmt.run({
          id: chunk.id,
          title: chunk.title,
          section: chunk.section,
          text: chunk.text,
          codeExamples: JSON.stringify(chunk.codeExamples),
          url: chunk.url,
          category: chunk.category,
        });

        const fullText =
          chunk.text + " " + chunk.codeExamples.join(" ");
        this.vectorIndex.set(chunk.id, this.computeTf(fullText));
      }
    });

    transaction(chunks);
  }

  clear(): void {
    this.db.prepare("DELETE FROM doc_chunks").run();
    this.db.prepare("DELETE FROM metadata").run();
    this.vectorIndex.clear();
    this.idfCache = null;
  }

  search(query: string, limit = 5): SearchResult[] {
    if (!query.trim() || this.vectorIndex.size === 0) return [];

    const queryTf = this.computeTf(query);
    const idf = this.computeIdf();
    const queryVector = this.toTfidf(queryTf, idf);

    const scores: Array<{ id: string; score: number }> = [];

    for (const [id, docTf] of this.vectorIndex) {
      const docVector = this.toTfidf(docTf, idf);
      const similarity = this.cosineSimilarity(queryVector, docVector);
      if (similarity > 0) {
        scores.push({ id, score: similarity });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, limit);

    if (topScores.length === 0) return [];

    const placeholders = topScores.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT id, title, section, text, code_examples, url, category FROM doc_chunks WHERE id IN (${placeholders})`
      )
      .all(...topScores.map((s) => s.id)) as Array<{
      id: string;
      title: string;
      section: string;
      text: string;
      code_examples: string;
      url: string;
      category: string;
    }>;

    const rowMap = new Map(rows.map((r) => [r.id, r]));

    return topScores
      .map((s) => {
        const row = rowMap.get(s.id);
        if (!row) return null;
        return {
          chunk: {
            id: row.id,
            title: row.title,
            section: row.section,
            text: row.text,
            codeExamples: JSON.parse(row.code_examples) as string[],
            url: row.url,
            category: row.category,
          },
          score: s.score,
        };
      })
      .filter((r): r is SearchResult => r !== null);
  }

  getStats(): { totalChunks: number; categories: string[]; lastSync: string | null } {
    const countRow = this.db
      .prepare("SELECT COUNT(*) as count FROM doc_chunks")
      .get() as { count: number };

    const categoryRows = this.db
      .prepare("SELECT DISTINCT category FROM doc_chunks")
      .all() as Array<{ category: string }>;

    const syncRow = this.db
      .prepare("SELECT value FROM metadata WHERE key = 'last_sync'")
      .get() as { value: string } | undefined;

    return {
      totalChunks: countRow.count,
      categories: categoryRows.map((r) => r.category),
      lastSync: syncRow?.value ?? null,
    };
  }

  setLastSync(timestamp: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_sync', ?)")
      .run(timestamp);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9.\-/]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  private computeTf(text: string): Map<string, number> {
    const terms = this.tokenize(text);
    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }
    let maxFreq = 0;
    for (const v of tf.values()) if (v > maxFreq) maxFreq = v;
    if (maxFreq === 0) maxFreq = 1;
    for (const [term, freq] of tf) {
      tf.set(term, 0.5 + 0.5 * (freq / maxFreq));
    }
    return tf;
  }

  private computeIdf(): Map<string, number> {
    if (this.idfCache) return this.idfCache;

    const docCount = this.vectorIndex.size || 1;
    const termDocCount: Map<string, number> = new Map();

    for (const [, tf] of this.vectorIndex) {
      for (const term of tf.keys()) {
        termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
      }
    }

    const idf = new Map<string, number>();
    for (const [term, count] of termDocCount) {
      idf.set(term, Math.log(docCount / count));
    }

    this.idfCache = idf;
    return idf;
  }

  private toTfidf(
    tf: Map<string, number>,
    idf: Map<string, number>
  ): Map<string, number> {
    const tfidf = new Map<string, number>();
    for (const [term, tfValue] of tf) {
      tfidf.set(term, tfValue * (idf.get(term) || 1));
    }
    return tfidf;
  }

  private cosineSimilarity(
    a: Map<string, number>,
    b: Map<string, number>
  ): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [, val] of a) normA += val * val;
    for (const [, val] of b) normB += val * val;

    const allTerms = new Set([...a.keys(), ...b.keys()]);
    for (const term of allTerms) {
      dotProduct += (a.get(term) || 0) * (b.get(term) || 0);
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  close(): void {
    this.db.close();
  }
}

let instance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!instance) {
    instance = new VectorStore();
  }
  return instance;
}
