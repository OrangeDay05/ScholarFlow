import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getMaterialStorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";

export async function getParsedDocumentAsset(actor: M3Actor, projectId: string, assetId: string) {
  const row = await getD1().prepare(`SELECT object_key, content_type, filename FROM parsed_document_assets
    WHERE id = ? AND owner_user_id = ? AND project_id = ? LIMIT 1`).bind(assetId, actor.userId, projectId).first<{ object_key: string; content_type: string; filename: string }>();
  if (!row) return null;
  const body = await getMaterialStorageAdapter().get(row.object_key);
  return body ? { body, contentType: row.content_type, filename: row.filename } : null;
}
