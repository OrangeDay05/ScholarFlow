import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RUNNER_ID = "scholarflow-artifact-tool";
const RUNNER_VERSION = "0.1.0";
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const artifactEntry = process.env.ARTIFACT_TOOL_ENTRY;
if (!artifactEntry) throw new Error("ARTIFACT_TOOL_ENTRY is required.");
const { Presentation, PresentationFile } = await import(pathToFileURL(artifactEntry).href);
const packageJson = JSON.parse(await readFile(join(artifactEntry, "..", "..", "package.json"), "utf8"));

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return send(response, 200, metadata({ status: "ok" }));
  if (request.method !== "POST" || request.url !== "/render") return send(response, 404, { error: "not found" });
  try {
    const chunks = []; let length = 0;
    for await (const chunk of request) { length += chunk.length; if (length > MAX_BODY_BYTES) throw new Error("请求超过 3MB 限制。"); chunks.push(chunk); }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const error = validate(payload);
    if (error) return send(response, 400, failure("INVALID_INPUT", error));
    const result = await renderDeck(payload.deck);
    return send(response, 200, metadata({ status: "succeeded", errorType: null, errorMessage: null, stdout: "", stderr: "", pptxBase64: result.bytes.toString("base64"), slideCount: payload.deck.slides.length }));
  } catch (error) { return send(response, 422, failure("PPTX_RENDER_FAILED", error instanceof Error ? error.message : "PPTX 生成失败。")); }
});

async function renderDeck(deck) {
  const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
  for (const [index, item] of deck.slides.entries()) buildSlide(presentation, item, index, deck);
  const directory = await mkdtemp(join(tmpdir(), "scholarflow-m9-"));
  const output = join(directory, "presentation.pptx");
  try { const pptx = await PresentationFile.exportPptx(presentation); await pptx.save(output); return { bytes: await readFile(output) }; }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function buildSlide(presentation, item, index, deck) {
  const slide = presentation.slides.add();
  slide.background.fill = index === 0 ? "#FFFDF7" : "#FFFFFF";
  addText(slide, index === 0 ? deck.scene.replaceAll("_", " ") : `0${index + 1}`, 72, 52, 450, 34, 18, true, "#007746");
  if (index === 0) {
    addText(slide, item.title, 72, 195, 1030, 160, 64, true, "#00392E");
    addText(slide, item.body.join("\n"), 72, 390, 900, 100, 26, false, "#47645A");
    addText(slide, `${deck.audience} · ${deck.durationMinutes} 分钟`, 72, 610, 600, 40, 18, false, "#718079");
  } else {
    addText(slide, item.title, 72, 100, 1136, 76, 44, true, "#00392E");
    addPanel(slide, 72, 205, 1136, 320, "#F1F7F2");
    if (item.asset) {
      addText(slide, item.body.map((line) => `• ${line}`).join("\n"), 105, 245, 445, 230, 28, false, "#183E32");
      const imageBytes = Buffer.from(item.asset.base64, "base64");
      slide.images.add({ blob: imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength), contentType: item.asset.contentType, alt: item.asset.alt, fit: "contain", position: { left: 610, top: 225, width: 540, height: 280 } });
    } else {
      addText(slide, item.body.map((line) => `• ${line}`).join("\n"), 105, 245, 980, 230, 32, false, "#183E32");
    }
    if (item.takeaway) { addPanel(slide, 72, 555, 1136, 78, "#D7EADA"); addText(slide, item.takeaway, 105, 576, 1040, 42, 25, true, "#14543A"); }
  }
  addText(slide, String(index + 1), 1170, 654, 40, 24, 14, false, "#718079");
  slide.speakerNotes.textFrame.setText(item.speakerNotes);
  slide.speakerNotes.setVisible(true);
}

function addText(slide, text, left, top, width, height, fontSize, bold, color) {
  const shape = slide.shapes.add({ geometry: "textbox", position: { left, top, width, height }, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  shape.text = text; shape.text.style = { fontSize, bold, color, fontFamily: "Microsoft YaHei" }; return shape;
}
function addPanel(slide, left, top, width, height, fill) { return slide.shapes.add({ geometry: "rect", position: { left, top, width, height }, fill, line: { style: "solid", fill: "none", width: 0 } }); }

function validate(payload) {
  if (!payload || typeof payload !== "object" || typeof payload.runId !== "string" || !payload.deck || !Array.isArray(payload.deck.slides)) return "请求契约无效。";
  if (payload.deck.slides.length < 3 || payload.deck.slides.length > 30) return "PPT 必须包含 3—30 页。";
  if (!Number.isInteger(payload.timeoutSeconds) || payload.timeoutSeconds < 10 || payload.timeoutSeconds > 120) return "超时必须为 10—120 秒。";
  for (const slide of payload.deck.slides) if (!slide || typeof slide.title !== "string" || !Array.isArray(slide.body) || typeof slide.speakerNotes !== "string" || !slide.speakerNotes.includes("[Sources]")) return "幻灯片内容或来源备注无效。";
  return null;
}
function metadata(value) { return { runnerId: RUNNER_ID, runnerVersion: RUNNER_VERSION, artifactToolVersion: packageJson.version, ...value }; }
function failure(errorType, errorMessage) { return metadata({ status: "failed", errorType, errorMessage, stdout: "", stderr: "", pptxBase64: null, slideCount: 0 }); }
function send(response, status, body) { const bytes = Buffer.from(JSON.stringify(body)); response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": bytes.length, "cache-control": "no-store" }); response.end(bytes); }

const port = Number(process.argv[2] || 4320);
server.listen(port, "127.0.0.1", () => console.log(`M9 PPTX runner listening on http://127.0.0.1:${port}`));
