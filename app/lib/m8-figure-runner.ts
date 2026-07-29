import type {
  M8FigureExecutionRequest,
  M8FigureExecutionResult,
} from "./m8-figure-contracts";
import { env } from "cloudflare:workers";

export interface M8FigureRunnerAdapter {
  readonly mode: "local_trusted" | "remote_sandbox" | "disabled";
  readonly runnerId: string;
  execute(request: M8FigureExecutionRequest): Promise<M8FigureExecutionResult>;
}

export class HttpM8FigureRunnerAdapter implements M8FigureRunnerAdapter {
  readonly runnerId = "scholarflow-local-python";
  readonly mode: "local_trusted" | "remote_sandbox";
  private readonly endpoint: string;
  constructor(
    endpoint: string,
    mode: "local_trusted" | "remote_sandbox" = "local_trusted",
  ) {
    this.endpoint = endpoint;
    this.mode = mode;
  }

  async execute(request: M8FigureExecutionRequest): Promise<M8FigureExecutionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (request.timeoutSeconds + 2) * 1_000);
    try {
      const response = await fetch(`${this.endpoint.replace(/\/$/u, "")}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const result = (await response.json()) as M8FigureExecutionResult;
      if (!response.ok && !["blocked", "failed", "timed_out"].includes(result.status)) {
        throw new Error("Figure runner returned an invalid error payload.");
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getM8FigureRunnerAdapter(): M8FigureRunnerAdapter {
  const endpoint = (env as { M8_FIGURE_RUNNER_URL?: string }).M8_FIGURE_RUNNER_URL;
  if (!endpoint) {
    throw new Error("M8_FIGURE_RUNNER_URL is not configured.");
  }
  return new HttpM8FigureRunnerAdapter(endpoint, "local_trusted");
}
