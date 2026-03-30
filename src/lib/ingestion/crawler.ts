import * as cheerio from "cheerio";

export interface CrawlResult {
  title: string;
  url: string;
  category: string;
  chunks: DocumentChunk[];
}

export interface DocumentChunk {
  id: string;
  title: string;
  section: string;
  text: string;
  codeExamples: string[];
  url: string;
  category: string;
}

const SECTIONS = [
  {
    name: "RouterOS Framework",
    paths: ["/docs/display/ROS/RouterOS", "/docs/display/ROS", "/docs/"],
  },
  {
    name: "Bridging and Switching",
    paths: ["/docs/display/ROS/Bridging+and+Switching", "/docs/display/ROS/Bridge"],
  },
  {
    name: "IP Routing",
    paths: ["/docs/display/ROS/IP+Routing", "/docs/display/ROS/Routing"],
  },
  {
    name: "Legacy RouterOS v6",
    paths: [
      "/docs/display/ROS/Legacy",
      "/docs/display/ROS/Legacy+Routing",
      "/docs/display/ROS/BGP",
      "/docs/display/ROS/OSPF",
      "/docs/display/ROS/Filtering+and+Policy+Routing",
      "/docs/display/ROS/Queues",
      "/docs/display/ROS/NAT",
      "/docs/display/ROS/DHCP",
      "/docs/display/ROS/DNS",
      "/docs/display/ROS/Hotspot",
      "/docs/display/ROS/PPP",
      "/docs/display/ROS/Firewall",
      "/docs/display/ROS/Mangle",
      "/docs/display/ROS/Queue+Trees",
      "/docs/display/ROS/Simple+Queues",
      "/docs/display/ROS/Connection+Tracking",
      "/docs/display/ROS/Address+Lists",
      "/docs/display/ROS/VLAN",
      "/docs/display/ROS/Scripting",
      "/docs/display/ROS/SNMP",
      "/docs/display/ROS/Netwatch",
      "/docs/display/ROS/Traffic+Flow",
      "/docs/display/ROS/PCC",
    ],
  },
];

export class MikroTikCrawler {
  private baseUrl = "https://help.mikrotik.com";
  private delay: number;
  private maxRetries: number;
  private timeout: number;

  constructor(options?: { delayMs?: number; maxRetries?: number; timeoutMs?: number }) {
    this.delay = options?.delayMs ?? 1500;
    this.maxRetries = options?.maxRetries ?? 3;
    this.timeout = options?.timeoutMs ?? 15000;
  }

  async sync(): Promise<{ documents: number; chunks: number; allChunks: DocumentChunk[] }> {
    const allResults: CrawlResult[] = [];

    for (const section of SECTIONS) {
      for (const path of section.paths) {
        const url = `${this.baseUrl}${path}`;
        try {
          const links = await this.collectLinks(url);
          const limitedLinks = links.slice(0, 15);

          for (const link of limitedLinks) {
            await this.sleep(this.delay);
            const result = await this.processPage(link, section.name);
            if (result) allResults.push(result);
          }
        } catch {
          // Continue to next section path
        }
      }
    }

    const allChunks = allResults.flatMap((r) => r.chunks);

    return {
      documents: allResults.length,
      chunks: allChunks.length,
      allChunks,
    };
  }

  async syncSinglePage(
    url: string,
    category: string
  ): Promise<CrawlResult | null> {
    return this.processPage(url, category);
  }

  private async fetchWithRetry(url: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "MikroTikExpertSentinel/1.0 (educational; documentation indexing)",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.delay * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  private async collectLinks(sectionUrl: string): Promise<string[]> {
    const links = new Set<string>();

    try {
      const html = await this.fetchWithRetry(sectionUrl);
      const $ = cheerio.load(html);

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        let resolved: string | null = null;
        if (href.startsWith("/docs/")) {
          resolved = `${this.baseUrl}${href}`;
        } else if (href.startsWith(this.baseUrl)) {
          resolved = href;
        }

        if (
          resolved &&
          !resolved.includes("#") &&
          !resolved.endsWith(".png") &&
          !resolved.endsWith(".jpg") &&
          !resolved.endsWith(".pdf")
        ) {
          links.add(resolved.split("?")[0]);
        }
      });
    } catch {
      // Return whatever was collected
    }

    return Array.from(links);
  }

  private async processPage(
    url: string,
    category: string
  ): Promise<CrawlResult | null> {
    try {
      const html = await this.fetchWithRetry(url);
      const $ = cheerio.load(html);

      const title =
        this.cleanText($("h1").first().text()) ||
        this.cleanText($("title").text()) ||
        "Untitled";

      const sections = this.extractSections($);
      if (sections.length === 0) return null;

      const chunks = this.createChunks(sections, title, url, category);
      if (chunks.length === 0) return null;

      return { title, url, category, chunks };
    } catch {
      return null;
    }
  }

  private extractSections(
    $: cheerio.CheerioAPI
  ): Array<{ heading: string; content: string; codeExamples: string[] }> {
    const sections: Array<{
      heading: string;
      content: string;
      codeExamples: string[];
    }> = [];

    let currentHeading = "";
    let currentContent = "";
    let currentCode: string[] = [];

    const mainSelectors = [
      "#main-content",
      ".wiki-content",
      "#content",
      "main",
      "article",
      ".content",
    ];

    let container: any = null;
    for (const sel of mainSelectors) {
      if ($(sel).length > 0) {
        container = $(sel).first();
        break;
      }
    }

    if (!container) container = $("body");

    container.children().each((_: number, el: any) => {
      const tag = ((el as { tagName?: string }).tagName || "").toLowerCase();

      if (["h1", "h2", "h3"].includes(tag)) {
        if (currentContent.trim() || currentCode.length > 0) {
          sections.push({
            heading: currentHeading,
            content: currentContent.trim(),
            codeExamples: [...currentCode],
          });
        }
        currentHeading = this.cleanText($(el).text());
        currentContent = "";
        currentCode = [];
      } else if (tag === "pre" || $(el).find("pre").length > 0) {
        const codeText = $(el).find("pre").length
          ? this.cleanCode($(el).find("pre").first().text())
          : this.cleanCode($(el).text());
        if (codeText.trim()) currentCode.push(codeText.trim());
      } else {
        const text = this.cleanText($(el).text());
        if (text) currentContent += text + "\n";
      }
    });

    if (currentContent.trim() || currentCode.length > 0) {
      sections.push({
        heading: currentHeading,
        content: currentContent.trim(),
        codeExamples: [...currentCode],
      });
    }

    if (sections.length === 0) {
      const bodyText = this.cleanText(container.text());
      if (bodyText.length > 30) {
        sections.push({
          heading: "Content",
          content: bodyText,
          codeExamples: [],
        });
      }
    }

    return sections;
  }

  private createChunks(
    sections: Array<{ heading: string; content: string; codeExamples: string[] }>,
    title: string,
    url: string,
    category: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      if (!section.content && section.codeExamples.length === 0) continue;

      const id = this.generateId(url, section.heading, chunkIndex++);

      chunks.push({
        id,
        title,
        section: section.heading || title,
        text: section.content,
        codeExamples: section.codeExamples,
        url,
        category,
      });
    }

    return this.deduplicate(chunks);
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private cleanCode(code: string): string {
    return code.replace(/\t/g, "  ");
  }

  private generateId(url: string, heading: string, index: number): string {
    const raw = `${url}-${heading}-${index}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `doc-${Math.abs(hash).toString(36)}`;
  }

  private deduplicate(chunks: DocumentChunk[]): DocumentChunk[] {
    const seen = new Set<string>();
    return chunks.filter((c) => {
      const key = c.text.substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
