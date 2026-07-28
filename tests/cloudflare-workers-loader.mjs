import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const shimUrl = new URL("./cloudflare-workers-shim.mjs", import.meta.url).href;
const projectRootUrl = new URL("../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: shimUrl, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const target = new URL(specifier.slice(2), projectRootUrl);
    const resolved = existsSync(fileURLToPath(target)) ? target : new URL(`${target.href}.ts`);
    return nextResolve(resolved.href, context);
  }
  if (specifier.startsWith(".") && context.parentURL) {
    const target = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(target)) && existsSync(`${fileURLToPath(target)}.ts`)) {
      return nextResolve(`${target.href}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}
