import assert from "node:assert/strict";

const baseUrl = new URL(
  process.env.M4_ACCEPTANCE_BASE_URL ?? "http://localhost:3000",
);
const command = process.argv[2];
const marker = process.argv[3];

if (!["seed", "verify"].includes(command) || !marker) {
  console.error(
    "Usage: node scripts/m4-persistent-d1-acceptance.mjs <seed|verify> <marker>",
  );
  process.exit(2);
}

const safeMarker = marker.toLowerCase().replace(/[^a-z0-9]/g, "-");
const ownerEmail = `i015-owner-${safeMarker}@example.test`;
const otherEmail = `i015-other-${safeMarker}@example.test`;
const m4ProjectTitle = `${marker}-M4-INTAKE`;
const workflowTitle = `${marker}-WORKFLOW`;

async function api(pathname, { email, method = "GET", body, status = 200, headers } = {}) {
  const requestHeaders = new Headers({
    accept: "application/json",
    ...headers,
  });
  if (email) requestHeaders.set("oai-authenticated-user-email", email);
  if (body !== undefined) requestHeaders.set("content-type", "application/json");
  const response = await fetch(new URL(pathname, baseUrl), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${pathname} returned non-JSON (${response.status}): ${text}`);
  }
  assert.equal(
    response.status,
    status,
    `${method} ${pathname}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

function exactProject(projects, title) {
  return projects.data.find((project) => project.title === title);
}

async function locateWorkflowProject() {
  const projects = await api("/api/m4/projects", { email: ownerEmail });
  const project = exactProject(projects, workflowTitle);
  assert.ok(project, `Persistent workflow project ${workflowTitle} was not found`);
  return project;
}

async function assertIsolation(projectId) {
  await api("/api/m4/projects", { status: 401 });
  const otherProjects = await api("/api/m4/projects", { email: otherEmail });
  assert.equal(
    exactProject(otherProjects, workflowTitle),
    undefined,
    "Cross-user project list leaked the workflow project",
  );
  await api(`/api/m4/projects/${projectId}/materials`, {
    email: otherEmail,
    status: 404,
  });
}

async function assertPersistedWorkspace(projectId) {
  const diagnosis = await api(`/api/m4/projects/${projectId}/diagnosis`, {
    email: ownerEmail,
  });
  assert.ok(diagnosis.data.versions.length >= 2);
  assert.ok(
    diagnosis.data.session.fields.some((field) => field.value === marker),
    "Diagnosis marker is missing",
  );

  const tasks = await api(`/api/m4/projects/${projectId}/tasks`, {
    email: ownerEmail,
  });
  assert.ok(tasks.data.tasks.some((task) => task.taskRole === "GENERATOR"));
  assert.ok(tasks.data.tasks.some((task) => task.taskRole === "REVIEWER"));
  assert.ok(tasks.data.reports.some((report) => report.summary === marker));
  assert.ok(tasks.data.decisions.some((decision) => decision.reason === marker));
  assert.ok(tasks.data.adoptions.length >= 1);

  const privacy = await api(`/api/m4/projects/${projectId}/privacy`, {
    email: ownerEmail,
  });
  assert.ok(privacy.data.profiles.length >= 1);
  assert.ok(privacy.data.copies.length >= 6);
  assert.ok(privacy.data.transmissions.length >= 3);
  assert.ok(
    privacy.data.transmissions.some((item) => item.status === "PLANNED"),
  );
  assert.ok(
    privacy.data.transmissions.filter((item) => item.status === "BLOCKED").length >= 2,
  );

  const models = await api(`/api/m4/projects/${projectId}/model-configs`, {
    email: ownerEmail,
  });
  assert.ok(models.data.profiles.some((profile) => profile.name === marker));

  const presentations = await api(
    `/api/m4/projects/${projectId}/presentations`,
    { email: ownerEmail },
  );
  const markedPresentations = presentations.data.projects.filter((project) =>
    project.title.startsWith(marker),
  );
  assert.equal(markedPresentations.length, presentationScenes.length);
  assert.ok(presentations.data.versions.length >= 1);
  assert.ok(presentations.data.slides.some((slide) => slide.title === marker));

  await assertIsolation(projectId);
  return {
    projectId,
    diagnosisCards: diagnosis.data.versions.length,
    tasks: tasks.data.tasks.length,
    reviewReports: tasks.data.reports.length,
    processingCopies: privacy.data.copies.length,
    transmissions: privacy.data.transmissions.length,
    executionProfiles: models.data.profiles.length,
    presentationProjects: markedPresentations.length,
    presentationVersions: presentations.data.versions.length,
    slides: presentations.data.slides.length,
  };
}

const presentationScenes = [
  "COURSE_PRESENTATION",
  "CLASSROOM_PRESENTATION",
  "LITERATURE_REVIEW_PRESENTATION",
  "GROUP_PRESENTATION",
  "FINAL_COURSE_PRESENTATION",
  "RESEARCH_PROPOSAL",
  "PROPOSAL_DEFENSE",
  "MIDTERM_DEFENSE",
  "THESIS_DEFENSE",
  "LAB_MEETING",
  "CONFERENCE_PRESENTATION",
  "PAPER_SHARING",
  "SUBMISSION_PRESENTATION",
];

async function seed() {
  const m4Created = await api("/api/m4/projects", {
    email: ownerEmail,
    method: "POST",
    status: 201,
    headers: { "Idempotency-Key": `${marker}-m4-intake` },
    body: {
      title: m4ProjectTitle,
      primaryCreationMethod: "idea",
      goal: marker,
      materialsSummary: "M4-H1 persistent D1 acceptance material",
      firstAiHelp: "Verify persistent storage",
      paperType: "课程论文",
      language: "中文",
    },
  });
  assert.equal(m4Created.data.project.title, m4ProjectTitle);

  const existingProjects = await api("/api/m4/projects", { email: ownerEmail });
  const existingWorkflow = exactProject(existingProjects, workflowTitle);
  const workflow = existingWorkflow
    ? { data: existingWorkflow }
    : await api("/api/m3/projects", {
        email: ownerEmail,
        method: "POST",
        status: 201,
        body: {
          title: workflowTitle,
          paperType: "课程论文",
          language: "中文",
          primaryCreationMethod: "idea",
          researchObject: marker,
          researchQuestion: "Does persistent D1 retain M4 domain state?",
          method: "Runtime API restart verification",
          requirements: marker,
        },
      });
  const projectId = workflow.data.id;
  await assertIsolation(projectId);

  const material = await api(`/api/m4/projects/${projectId}/materials`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      kind: "data",
      filename: `${marker}.csv`,
      contentType: "text/csv",
      sizeBytes: 128,
    },
  });
  const materialId = material.data.id;

  const currentDiagnosis = await api(
    `/api/m4/projects/${projectId}/diagnosis`,
    { email: ownerEmail },
  );
  const diagnosisStart =
    currentDiagnosis.data.session?.status === "active"
      ? currentDiagnosis
      : await api(`/api/m4/projects/${projectId}/diagnosis`, {
          email: ownerEmail,
          method: "POST",
          status: 201,
          body: { action: "start", mode: "guided", depth: "standard" },
        });
  const sessionId = diagnosisStart.data.session.id;
  const questionId = diagnosisStart.data.session.questions[0].question_id;
  await api(`/api/m4/projects/${projectId}/diagnosis`, {
    email: ownerEmail,
    method: "POST",
    body: {
      action: "answer",
      session_id: sessionId,
      question_id: questionId,
      answer: marker,
      answer_status: "USER_CONFIRMED",
      answer_source_type: "USER_INPUT",
      confidence: "HIGH",
    },
  });
  await api(`/api/m4/projects/${projectId}/diagnosis`, {
    email: ownerEmail,
    method: "POST",
    body: {
      action: "save_fields",
      session_id: sessionId,
      fields: [
        {
          field: "project_goal",
          label: "项目目标",
          value: marker,
          status: "USER_CONFIRMED",
          source_type: "USER_INPUT",
          source_material_ids: [],
          source_locations: [],
          confidence: "HIGH",
          requires_confirmation: false,
          rationale: "M4-H1 persistent D1 acceptance",
        },
        {
          field: "research_method",
          label: "研究方法",
          value: "Mock corpus comparison",
          status: "AI_INFERRED",
          source_type: "AI_RECOMMENDED",
          source_material_ids: [materialId],
          source_locations: ["M4-H1 acceptance marker"],
          confidence: "MEDIUM",
          requires_confirmation: true,
          rationale: "AI 推测，待用户确认",
        },
      ],
    },
  });
  const diagnosisFinish = await api(`/api/m4/projects/${projectId}/diagnosis`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "finish",
      session_id: sessionId,
      stop_reason: "M4-H1 persistence acceptance complete",
    },
  });
  const diagnosisCardId = diagnosisFinish.data.latest_diagnosis_card_id;

  const m3Workspace = await api(
    `/api/m3/projects/${projectId}/workspace?section=introduction`,
    { email: ownerEmail },
  );
  const section = m3Workspace.data.outline.sections.find(
    (item) => item.slug === "introduction",
  );
  const version = m3Workspace.data.versions.at(-1);
  assert.ok(section && version, "M3 project did not create an introduction version");

  const generator = await api(`/api/m4/projects/${projectId}/tasks`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "create",
      section_id: section.id,
      task_role: "GENERATOR",
      product_skill: "章节写作",
      task_type: "draft",
      review_mode: "none",
      selected_material_ids: [materialId],
      max_calls: 1,
      timeout_seconds: 60,
      idempotency_key: `${marker}-generator`,
      models: [],
    },
  });
  const reviewer = await api(`/api/m4/projects/${projectId}/tasks`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "create",
      parent_task_id: generator.data.id,
      section_id: section.id,
      task_role: "REVIEWER",
      product_skill: "引用与证据检查",
      task_type: "review",
      review_mode: "standard",
      selected_material_ids: [materialId],
      reviewed_version_id: version.id,
      max_calls: 1,
      timeout_seconds: 60,
      idempotency_key: `${marker}-reviewer`,
      models: [],
    },
  });
  const reviewed = await api(`/api/m4/projects/${projectId}/tasks`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "review",
      task_id: reviewer.data.id,
      reviewed_version_id: version.id,
      conclusion: "REVISION_REQUIRED",
      summary: marker,
      context_snapshot: {
        user_requirement: marker,
        diagnosis_card_id: diagnosisCardId,
        material_ids: [materialId],
        generated_version_id: version.id,
        evidence_binding_ids: [],
      },
      issues: [
        {
          category: "EVIDENCE",
          severity: "MEDIUM",
          title: marker,
          detail: "Persistent review issue",
          suggestion: "Keep the evidence binding explicit",
          model_sources: ["mock-reviewer"],
          evidence_binding_ids: [],
        },
      ],
    },
  });
  await api(`/api/m4/projects/${projectId}/tasks`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "decide",
      report_id: reviewed.data.reports[0].id,
      issue_id: reviewed.data.reports[0].issues[0].id,
      decision: "IGNORED",
      reason: marker,
    },
  });
  await api(`/api/m4/projects/${projectId}/tasks`, {
    email: ownerEmail,
    method: "POST",
    body: {
      action: "adopt",
      section_id: section.id,
      version_id: version.id,
      source_task_id: generator.data.id,
      candidate_type: "GENERATED",
    },
  });

  const profile = await api(`/api/m4/projects/${projectId}/privacy`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "profile",
      material_id: materialId,
      direct_identifiers: ["姓名"],
      indirect_identifiers: ["班级"],
      sensitive_attributes: ["成绩"],
      research_necessary_variables: ["实验条件"],
      ordinary_research_content: ["回答文本"],
      confidentiality_restrictions: [],
      copyright_restrictions: [],
      recommended_mode: "PSEUDONYMIZED",
      confirm: true,
    },
  });
  const profileId = profile.data.profiles[0].id;
  const checks = [
    "EXPERIMENTAL_CONDITIONS",
    "SAMPLE_COUNT",
    "PARTICIPANT_SEPARATION",
    "CHRONOLOGY",
    "RESEARCH_NECESSARY_VARIABLES",
    "NUMERIC_PRECISION",
    "SPEAKER_RELATIONSHIPS",
  ].map((type) => ({
    type,
    status: "PASSED",
    detail: "M4-H1 保持不变",
    blocking: false,
  }));
  const copies = new Map();
  for (const mode of [
    "RAW_ALLOWED",
    "SELECTIVE_REDACTION",
    "PSEUDONYMIZED",
    "AGGREGATED_ONLY",
    "LOCAL_ONLY",
    "EXTERNAL_BLOCKED",
  ]) {
    const copy = await api(`/api/m4/projects/${projectId}/privacy`, {
      email: ownerEmail,
      method: "POST",
      status: 201,
      body: {
        action: "copy",
        material_id: materialId,
        profile_id: profileId,
        mode,
        transformations: [`${marker}-${mode}`],
        approved_by_user: true,
        fidelity_checks: checks,
      },
    });
    const createdCopy = copy.data.copies.find((item) => item.mode === mode);
    assert.ok(createdCopy, `Processing copy for ${mode} was not returned`);
    copies.set(mode, createdCopy.id);
  }
  await api(`/api/m4/projects/${projectId}/privacy`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "pseudonym_map",
      processing_copy_id: copies.get("PSEUDONYMIZED"),
      secret_reference: `vault-ref://i015/${safeMarker}`,
      mapping_count: 1,
      access_scope: "OWNER_ONLY",
      reversible: true,
    },
  });
  for (const mode of ["PSEUDONYMIZED", "LOCAL_ONLY", "EXTERNAL_BLOCKED"]) {
    await api(`/api/m4/projects/${projectId}/privacy`, {
      email: ownerEmail,
      method: "POST",
      status: 201,
      body: {
        action: "transmission",
        task_id: generator.data.id,
        material_id: materialId,
        processing_copy_id: copies.get(mode),
        provider_key: "mock-provider",
        purpose: `${marker}-${mode}`,
      },
    });
  }

  const modelWorkspace = await api(
    `/api/m4/projects/${projectId}/model-configs`,
    { email: ownerEmail },
  );
  assert.ok(modelWorkspace.data.models.length >= 2);
  await api(`/api/m4/projects/${projectId}/model-configs`, {
    email: ownerEmail,
    method: "POST",
    status: 201,
    body: {
      action: "profile",
      name: marker,
      mode: "STANDARD",
      max_models: 2,
      max_calls: 2,
      timeout_seconds: 60,
      fallback_plan: marker,
      assignments: [
        {
          provider_model_id: modelWorkspace.data.models[0].id,
          role: "GENERATOR",
          priority: 1,
        },
        {
          provider_model_id: modelWorkspace.data.models[1].id,
          role: "REVIEWER",
          priority: 2,
        },
      ],
    },
  });

  let firstPresentationId;
  for (const scene of presentationScenes) {
    const presentation = await api(
      `/api/m4/projects/${projectId}/presentations`,
      {
        email: ownerEmail,
        method: "POST",
        status: 201,
        body: {
          action: "create",
          title: `${marker}-${scene}`,
          scene,
          readiness_status: "READY_WITH_WARNINGS",
          truth_status: "PARTIALLY_VERIFIED",
          source_section_version_id: version.id,
          source_material_snapshot: [materialId],
          audience: "M4-H1 reviewers",
          duration_minutes: 10,
        },
      },
    );
    firstPresentationId ??= presentation.data.projects[0].id;
  }
  const presentationVersion = await api(
    `/api/m4/projects/${projectId}/presentations`,
    {
      email: ownerEmail,
      method: "POST",
      status: 201,
      body: {
        action: "version",
        presentation_project_id: firstPresentationId,
        source_section_version_id: version.id,
        material_snapshot: [materialId],
        narrative: { marker },
      },
    },
  );
  const presentationVersionId = presentationVersion.data.versions[0].id;
  await api(`/api/m4/projects/${projectId}/presentations`, {
    email: ownerEmail,
    method: "POST",
    body: {
      action: "slide",
      presentation_version_id: presentationVersionId,
      position: 1,
      title: marker,
      content: { marker },
      speaker_notes: marker,
      source_bindings: [materialId, version.id],
      verification_status: "VERIFIED_WITH_WARNINGS",
    },
  });
  await api(`/api/m4/projects/${projectId}/presentations`, {
    email: ownerEmail,
    method: "POST",
    body: {
      action: "adopt",
      presentation_version_id: presentationVersionId,
    },
  });

  return assertPersistedWorkspace(projectId);
}

const summary =
  command === "seed"
    ? await seed()
    : await assertPersistedWorkspace((await locateWorkflowProject()).id);
console.log(
  JSON.stringify(
    {
      command,
      marker,
      baseUrl: baseUrl.href,
      ownerEmail,
      result: "PASS",
      ...summary,
    },
    null,
    2,
  ),
);
