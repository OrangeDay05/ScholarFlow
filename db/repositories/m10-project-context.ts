import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

export type ProductRole = "AUTHOR" | "REVIEWER";

export type ProjectAccessContext = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectTitle: string;
  role: ProductRole;
  canEdit: boolean;
  permissionLabel: string;
  assignmentStatus: string | null;
};

export class ProjectContextError extends Error {
  readonly code: "PROJECT_CONTEXT_REQUIRED" | "PROJECT_NOT_FOUND" | "PROJECT_FORBIDDEN";

  constructor(
    code: "PROJECT_CONTEXT_REQUIRED" | "PROJECT_NOT_FOUND" | "PROJECT_FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

type AccessRow = {
  workspace_id: string;
  workspace_name: string;
  project_id: string;
  project_title: string;
  role: ProductRole;
  can_edit: number;
  assignment_status: string | null;
};

export async function listAvailableProductRoles(actor: M3Actor): Promise<ProductRole[]> {
  const db = getD1();
  const roles = new Set<ProductRole>();
  const authored = await db
    .prepare("SELECT 1 FROM projects WHERE owner_user_id = ? LIMIT 1")
    .bind(actor.userId)
    .first();
  if (authored) roles.add("AUTHOR");
  const reviewed = await db
    .prepare(
      `SELECT 1 FROM workspace_memberships
       WHERE user_id = ? AND role = 'REVIEWER' AND status = 'active' LIMIT 1`,
    )
    .bind(actor.userId)
    .first();
  if (reviewed) roles.add("REVIEWER");
  if (roles.size === 0) roles.add("AUTHOR");
  return [...roles];
}

export async function listProjectAccessForActor(
  actor: M3Actor,
  role: ProductRole,
): Promise<ProjectAccessContext[]> {
  const db = getD1();
  const query =
    role === "AUTHOR"
      ? `SELECT w.id AS workspace_id, w.name AS workspace_name,
                p.id AS project_id, p.title AS project_title,
                'AUTHOR' AS role, 1 AS can_edit, NULL AS assignment_status
         FROM projects p
         JOIN workspaces w ON w.id = p.workspace_id
         WHERE p.owner_user_id = ? AND p.status = 'active'
         ORDER BY p.updated_at DESC, p.created_at DESC`
      : `SELECT w.id AS workspace_id, w.name AS workspace_name,
                p.id AS project_id, p.title AS project_title,
                'REVIEWER' AS role, 0 AS can_edit, ra.status AS assignment_status
         FROM review_assignments ra
         JOIN projects p ON p.id = ra.project_id AND p.status = 'active'
         JOIN workspaces w ON w.id = ra.workspace_id
         JOIN project_memberships pm
           ON pm.project_id = p.id AND pm.user_id = ra.reviewer_user_id
          AND pm.role = 'REVIEWER' AND pm.status = 'active'
         WHERE ra.reviewer_user_id = ? AND ra.status IN ('assigned', 'in_review')
         ORDER BY ra.updated_at DESC, ra.created_at DESC`;
  const rows = await db.prepare(query).bind(actor.userId).all<AccessRow>();
  return (rows.results ?? []).map(toContext);
}

export async function loadProjectAccessContext(
  actor: M3Actor,
  projectId: string,
  requestedRole?: ProductRole,
): Promise<ProjectAccessContext> {
  if (!projectId || projectId === "demo") {
    throw new ProjectContextError(
      "PROJECT_CONTEXT_REQUIRED",
      "缺少明确的项目上下文，请从项目列表选择项目。",
    );
  }
  const db = getD1();
  const exists = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND status = 'active'")
    .bind(projectId)
    .first<{ id: string }>();
  if (!exists) {
    throw new ProjectContextError("PROJECT_NOT_FOUND", "项目不存在或已归档。");
  }

  if (requestedRole !== "REVIEWER") {
    const author = await db
      .prepare(
        `SELECT w.id AS workspace_id, w.name AS workspace_name,
                p.id AS project_id, p.title AS project_title,
                'AUTHOR' AS role, 1 AS can_edit, NULL AS assignment_status
         FROM projects p JOIN workspaces w ON w.id = p.workspace_id
         WHERE p.id = ? AND p.owner_user_id = ? AND p.status = 'active'`,
      )
      .bind(projectId, actor.userId)
      .first<AccessRow>();
    if (author) return toContext(author);
  }

  const reviewer = await db
    .prepare(
      `SELECT w.id AS workspace_id, w.name AS workspace_name,
              p.id AS project_id, p.title AS project_title,
              'REVIEWER' AS role, 0 AS can_edit, ra.status AS assignment_status
       FROM review_assignments ra
       JOIN projects p ON p.id = ra.project_id AND p.status = 'active'
       JOIN workspaces w ON w.id = ra.workspace_id
       JOIN project_memberships pm
         ON pm.project_id = p.id AND pm.user_id = ra.reviewer_user_id
        AND pm.role = 'REVIEWER' AND pm.status = 'active'
       WHERE ra.project_id = ? AND ra.reviewer_user_id = ?
         AND ra.status IN ('assigned', 'in_review')`,
    )
    .bind(projectId, actor.userId)
    .first<AccessRow>();
  if (reviewer) return toContext(reviewer);
  throw new ProjectContextError(
    "PROJECT_FORBIDDEN",
    "当前账号不拥有该项目，也没有有效的审核分配。",
  );
}

export async function requireProjectEditAccess(
  actor: M3Actor,
  projectId: string,
): Promise<ProjectAccessContext> {
  const context = await loadProjectAccessContext(actor, projectId);
  if (!context.canEdit || context.role !== "AUTHOR") {
    throw new ProjectContextError("PROJECT_FORBIDDEN", "当前身份仅可审核，不能修改正文或创建修改任务。");
  }
  return context;
}

function toContext(row: AccessRow): ProjectAccessContext {
  const canEdit = Boolean(row.can_edit);
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    projectId: row.project_id,
    projectTitle: row.project_title,
    role: row.role,
    canEdit,
    permissionLabel: canEdit ? "可编辑项目与正文" : "仅可审核，不可修改正文",
    assignmentStatus: row.assignment_status,
  };
}
