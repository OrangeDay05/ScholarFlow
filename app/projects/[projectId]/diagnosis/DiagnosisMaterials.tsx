"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./formal-diagnosis.module.css";

type MaterialKind = "requirement" | "manuscript" | "literature" | "data" | "image" | "note";
type Material = {
  materialId: string;
  originalFilename: string;
  kind: MaterialKind;
  materialStatus: string;
  objectStatus: string;
  sizeBytes: number;
};

const kinds: Array<[MaterialKind, string]> = [
  ["manuscript", "初稿"], ["literature", "文献"], ["requirement", "要求"],
  ["data", "研究数据"], ["image", "图片"], ["note", "其他材料"],
];

export function DiagnosisMaterials({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploadKind, setUploadKind] = useState<MaterialKind>("manuscript");
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void refresh(); }, [projectId]);

  async function refresh() {
    try { setMaterials(await api<Material[]>(`/api/m5/projects/${projectId}/materials`)); }
    catch (caught) { setError(message(caught)); }
  }

  async function upload(file: File) {
    setBusyId("upload"); setError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("kind", uploadKind);
      const stored = await api<{ snapshot: Material }>(`/api/m5/projects/${projectId}/materials`, {
        method: "POST", headers: { "Idempotency-Key": `diagnosis-upload:${crypto.randomUUID()}` }, body: form,
      });
      await api(`/api/m5/projects/${projectId}/materials/${stored.snapshot.materialId}/parse`, {
        method: "POST", headers: { "Idempotency-Key": `diagnosis-parse:${crypto.randomUUID()}` },
      });
      await refresh();
    } catch (caught) { setError(message(caught)); }
    finally { setBusyId(""); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function changeKind(materialId: string, kind: MaterialKind) {
    setBusyId(materialId); setError("");
    try {
      const updated = await api<Material>(`/api/m5/projects/${projectId}/materials`, {
        method: "PATCH", body: JSON.stringify({ material_id: materialId, kind }),
      });
      setMaterials((current) => current.map((item) => item.materialId === materialId ? updated : item));
    } catch (caught) { setError(message(caught)); }
    finally { setBusyId(""); }
  }

  async function remove(materialId: string) {
    setBusyId(materialId); setError("");
    try {
      await api(`/api/m5/projects/${projectId}/materials`, {
        method: "DELETE", body: JSON.stringify({ material_id: materialId }),
      });
      setMaterials((current) => current.filter((item) => item.materialId !== materialId));
      setConfirmId("");
    } catch (caught) { setError(message(caught)); }
    finally { setBusyId(""); }
  }

  return <section className={styles.materials}>
    <header>
      <div><span>PROJECT MATERIALS</span><h2>项目材料</h2><p>材料类别决定后续检索与诊断用途；调整类别不会改写原文件。</p></div>
      <div className={styles.materialUpload}>
        <select aria-label="新材料类别" onChange={(event) => setUploadKind(event.target.value as MaterialKind)} value={uploadKind}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button disabled={busyId === "upload"} onClick={() => inputRef.current?.click()} type="button">{busyId === "upload" ? "正在保存并解析…" : "添加材料"}</button>
        <input ref={inputRef} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} type="file" />
      </div>
    </header>
    {error ? <p className={styles.materialError} role="alert">{error}</p> : null}
    <div className={styles.materialList}>
      {materials.length ? materials.map((item) => <article key={item.materialId}>
        <div><strong>{item.originalFilename}</strong><small>{formatSize(item.sizeBytes)} · {statusLabel(item.materialStatus)}</small></div>
        <select aria-label={`调整《${item.originalFilename}》的材料类别`} disabled={busyId === item.materialId} onChange={(event) => void changeKind(item.materialId, event.target.value as MaterialKind)} value={item.kind}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {confirmId === item.materialId ? <div className={styles.removeConfirm}><span>从项目移除？原始对象保留作审计追溯。</span><button disabled={busyId === item.materialId} onClick={() => void remove(item.materialId)} type="button">确认移除</button><button onClick={() => setConfirmId("")} type="button">取消</button></div> : <button className={styles.removeMaterial} onClick={() => setConfirmId(item.materialId)} type="button">从项目移除</button>}
      </article>) : <p className={styles.materialEmpty}>当前项目还没有材料。你可以在这里添加初稿、文献、要求或研究数据。</p>}
    </div>
  </section>;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init, headers: init?.body instanceof FormData ? init.headers : init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "请求失败。");
  return payload.data as T;
}
function message(value: unknown) { return value instanceof Error ? value.message : "操作失败。"; }
function formatSize(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function statusLabel(value: string) { return ({ parsed: "解析成功", success: "解析成功", awaiting_parse: "等待解析", parsing: "解析中", failed: "解析失败" } as Record<string, string>)[value] ?? value; }
