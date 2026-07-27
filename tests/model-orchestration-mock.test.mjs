import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL(
  "../app/lib/model-orchestration-mock.ts",
  import.meta.url,
);
const featureUrl = new URL(
  "../app/lib/model-orchestration-features.ts",
  import.meta.url,
);
const pageUrl = new URL(
  "../app/settings/models/ModelAccessClient.tsx",
  import.meta.url,
);

test("freezes five model roles and bounded orchestration modes", async () => {
  const contract = await readFile(contractUrl, "utf8");

  for (const role of [
    "GENERATOR",
    "REVIEWER",
    "VERIFIER",
    "REVISER",
    "ROUTER",
  ]) {
    assert.match(contract, new RegExp(`"${role}"`));
  }

  for (const mode of ["STANDARD", "STRICT", "CUSTOM"]) {
    assert.match(contract, new RegExp(`"${mode}"`));
  }

  assert.match(contract, /maxModels: 2/);
  assert.match(contract, /maxModels: 3/);
  assert.match(contract, /maxModels: 4/);
  assert.match(contract, /max_total_calls/);
  assert.match(contract, /timeout_seconds/);
  assert.match(contract, /stop_conditions/);
  assert.match(contract, /禁止模型之间无限循环/);
});

test("separates platform and user credentials without collecting real keys", async () => {
  const [contract, page] = await Promise.all([
    readFile(contractUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);

  assert.match(contract, /PLATFORM_CREDENTIAL/);
  assert.match(contract, /USER_CREDENTIAL/);
  assert.match(contract, /owner_user_id/);
  assert.match(contract, /organization_id/);
  assert.match(contract, /masked_key/);
  assert.match(contract, /encrypted_secret_ref: null/);
  assert.match(contract, /allowed_project_ids/);
  assert.match(contract, /allowed_roles/);

  assert.match(page, /不要粘贴真实 Key/);
  assert.match(page, /disabled[\s\S]*type="password"/);
  assert.match(page, /测试连接 · Mock/);
  assert.match(page, /禁用 Key/);
  assert.match(page, /删除 Key/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|fetch\(/);
});

test("shows every execution preflight disclosure before a mock task", async () => {
  const page = await readFile(pageUrl, "utf8");

  for (const landmark of [
    "生成模型",
    "审阅模型",
    "验证模型",
    "平台额度",
    "预计调用",
    "预计发送资料",
    "数据处理方",
    "预计耗时",
    "失败降级",
  ]) {
    assert.match(page, new RegExp(landmark));
  }
});

test("preserves model sources, conflict evidence, and partial artifacts", async () => {
  const contract = await readFile(contractUrl, "utf8");

  assert.match(contract, /model_assignment_id/);
  assert.match(contract, /source_material_ids/);
  assert.match(contract, /source_locations/);
  assert.match(contract, /重复问题可以合并，但必须保留每个模型的来源/);
  assert.match(contract, /事实和引用问题必须回到原始材料核验/);
  assert.match(contract, /最终采纳由用户决定/);

  for (const failure of [
    "GENERATION_FAILED",
    "REVIEW_FAILED",
    "VERIFICATION_FAILED",
    "PARTIAL_TIMEOUT",
    "INVALID_KEY",
    "INSUFFICIENT_QUOTA",
    "PROVIDER_RATE_LIMITED",
    "USER_CANCELLED",
  ]) {
    assert.match(contract, new RegExp(failure));
  }

  assert.match(contract, /保留生成版本/);
  assert.match(contract, /整体不通过/);
  assert.match(contract, /不自动无限重试/);
});

test("keeps orchestration front-only and behind one switch", async () => {
  const [contract, feature, page] = await Promise.all([
    readFile(contractUrl, "utf8"),
    readFile(featureUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);

  assert.match(feature, /NEXT_PUBLIC_MODEL_ORCHESTRATION_MOCK/);
  assert.match(page, /M3 前端 Mock/);
  assert.match(page, /真实加密与路由推迟到 M5/);
  assert.doesNotMatch(
    `${contract}\n${feature}\n${page}`,
    /drizzle|db\/schema|app\/api|saveM3|migrate/i,
  );
});
