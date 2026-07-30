import type { M9RenderRequest, M9RenderResult } from "./m9-presentation-contracts";

export interface M9PptxRunnerAdapter {
  readonly runnerId: string;
  render(request: M9RenderRequest): Promise<M9RenderResult>;
}

export class HttpM9PptxRunnerAdapter implements M9PptxRunnerAdapter {
  readonly runnerId = "scholarflow-artifact-tool";
  private readonly endpoint: string;
  constructor(endpoint: string) { this.endpoint = endpoint; }
  async render(request: M9RenderRequest): Promise<M9RenderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (request.timeoutSeconds + 5) * 1_000);
    try {
      const response = await fetch(`${this.endpoint}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: controller.signal });
      const result = await response.json() as M9RenderResult;
      if (!response.ok && !["failed", "timed_out"].includes(result.status)) throw new Error("PPTX Runner 返回了无效错误响应。");
      return result;
    } finally { clearTimeout(timer); }
  }
}

export function getM9PptxRunnerAdapter(): M9PptxRunnerAdapter {
  const endpoint = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.M9_PPTX_RUNNER_URL;
  if (!endpoint) throw new Error("M9_PPTX_RUNNER_URL is not configured.");
  return new HttpM9PptxRunnerAdapter(endpoint.replace(/\/$/u, ""));
}
