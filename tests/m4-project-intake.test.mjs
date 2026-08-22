import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [contracts, repository, projectRoute, projectDeleteRoute, materialRoute, featureFlags] =
  await Promise.all([
    readFile(new URL("../app/lib/m4-project-contracts.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repositories/m4-projects.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/m4/projects/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/m4/projects/[projectId]/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/m4/projects/[projectId]/materials/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/lib/m4-features.ts", import.meta.url), "utf8"),
  ]);

test("M4 project intake requires the five-mode selector and three minimum answers", () => {
  for (const mode of [
    "idea",
    "existing_draft",
    "requirements",
    "literature",
    "data",
  ]) {
    assert.match(projectRoute, new RegExp(`"${mode}"`));
  }
  for (const field of ["goal", "materialsSummary", "firstAiHelp"]) {
    assert.match(contracts, new RegExp(`${field}: string`));
    assert.match(projectRoute, new RegExp(`body\\.${field}`));
  }
  assert.match(projectRoute, /三个最低问题均为必填项/);
});

test("M4 project resources are always scoped by owner and project", () => {
  assert.match(repository, /WHERE owner_user_id = \?/);
  assert.match(
    repository,
    /FROM projects\s+WHERE id = \? AND owner_user_id = \?/,
  );
  assert.match(
    repository,
    /FROM materials[\s\S]*WHERE owner_user_id = \? AND project_id = \?/,
  );
  assert.match(repository, /项目不存在或不属于当前用户/);
});

test("project deletion is owner-scoped and hidden from active project access", () => {
  assert.match(projectDeleteRoute, /export async function DELETE/);
  assert.match(projectDeleteRoute, /deleteM4ProjectForActor/);
  assert.match(repository, /SET status = 'deleted'/);
  assert.match(repository, /WHERE id = \? AND owner_user_id = \?/);
  assert.match(repository, /status IN \('active', 'archived'\)/);
});

test("M4 intake persists user facts without pretending pending metadata is confirmed", () => {
  assert.match(repository, /\["intake_goal", input\.goal\]/);
  assert.match(repository, /\["intake_materials", input\.materialsSummary\]/);
  assert.match(repository, /\["intake_first_ai_help", input\.firstAiHelp\]/);
  assert.match(repository, /paperType \?\?|"待确认"/);
  assert.match(repository, /language \?\?|"待确认"/);
  assert.match(contracts, /titleWasDerived: boolean/);
  assert.match(contracts, /paperTypePending: boolean/);
});

test("M4 material endpoint only registers metadata and does not claim parsing", () => {
  assert.match(materialRoute, /registerM4MaterialForActor/);
  assert.match(repository, /'queued'/);
  assert.match(repository, /m4-pending:\/\//);
  assert.doesNotMatch(materialRoute, /parse|upload|provider/i);
});

test("M4 core persistence remains behind an explicit feature flag", () => {
  assert.match(featureFlags, /NEXT_PUBLIC_M4_PERSISTENCE_ENABLED/);
  assert.match(featureFlags, /M4_DIAGNOSIS_PERSISTENCE_ENABLED/);
});
