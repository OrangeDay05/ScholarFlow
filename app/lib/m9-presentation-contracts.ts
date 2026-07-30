import type { M4PresentationScene } from "./m4-presentation-contracts";

export type M9SlideSpec = {
  title: string;
  body: string[];
  takeaway?: string;
  speakerNotes: string;
  sourceBindings: string[];
  asset?: { contentType: "image/png" | "image/jpeg"; base64: string; alt: string };
};

export type M9DeckSpec = {
  title: string;
  subtitle: string;
  scene: M4PresentationScene;
  audience: string;
  durationMinutes: number;
  language: "zh-CN" | "en-US";
  visualStyle: "scholar_green";
  slides: M9SlideSpec[];
  qaPreparation: Array<{ question: string; answer: string }>;
};

export type M9RenderRequest = { runId: string; deck: M9DeckSpec; timeoutSeconds: number };
export type M9RenderResult = {
  status: "succeeded" | "failed" | "timed_out";
  runnerId: string;
  runnerVersion: string;
  artifactToolVersion: string;
  errorType: string | null;
  errorMessage: string | null;
  stdout: string;
  stderr: string;
  pptxBase64: string | null;
  slideCount: number;
};

export function validateM9DeckSpec(deck: M9DeckSpec): string[] {
  const errors: string[] = [];
  if (!deck.title.trim() || deck.title.length > 160) errors.push("PPT 标题必须为 1—160 字符。");
  if (!deck.audience.trim()) errors.push("必须说明目标听众。");
  if (!Number.isInteger(deck.durationMinutes) || deck.durationMinutes < 3 || deck.durationMinutes > 180) errors.push("目标时长必须为 3—180 分钟。");
  if (deck.slides.length < 3 || deck.slides.length > 30) errors.push("PPT 必须包含 3—30 页。");
  for (const [index, slide] of deck.slides.entries()) {
    if (!slide.title.trim() || slide.title.length > 100) errors.push(`第 ${index + 1} 页标题必须为 1—100 字符。`);
    if (slide.body.length > 6 || slide.body.some((item) => item.length > 180)) errors.push(`第 ${index + 1} 页正文过密。`);
    if (!slide.speakerNotes.includes("[Sources]")) errors.push(`第 ${index + 1} 页讲者备注缺少 [Sources] 区块。`);
    if (slide.asset && !["image/png", "image/jpeg"].includes(slide.asset.contentType)) errors.push(`第 ${index + 1} 页包含不支持的图片格式。`);
  }
  if (deck.qaPreparation.length > 12) errors.push("问答准备不得超过 12 项。");
  return errors;
}
