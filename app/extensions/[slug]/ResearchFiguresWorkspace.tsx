"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { buildM8PythonFigureCode, defaultM8FigureData } from "@/app/lib/m8-figure-code";
import {
  inferM8Columns,
  M8_FIGURE_CATALOG,
  M8_IMPLEMENTED_FIGURE_TYPES,
  M8_PUBLICATION_PRESETS,
  recommendM8FigureTypes,
  type M8ColumnSchema,
  type M8DatasetRow,
  type M8ImplementedFigureType,
  type M8StatisticalFigureSpec,
  type M8DiagramType,
} from "@/app/lib/m8-figure-contracts";
import styles from "./ResearchFiguresWorkspace.module.css";

type RunResult = {
  figureProjectId: string; figureVersionId: string; figureVersionNumber: number;
  dataSnapshotId: string; dataSnapshotReused: boolean; codeVersionId: string; codeVersionReused: boolean;
  codeMode: "managed" | "customized" | "forked"; runRecordId: string;
  status: "succeeded" | "failed" | "timed_out" | "runner_unavailable"; code: string;
  assets: Array<{ id: string; format: "png" | "svg" | "pdf" | "tiff"; width: number; height: number; dpi: number; contentHash: string; fileSize: number }>;
  errorType: string | null; errorMessage: string | null; stderr: string;
};

type RunHistory = {
  id: string; figure_project_id: string; figure_version_id: string; data_snapshot_id: string; code_version_id: string;
  status: string; queued_at: string; finished_at: string | null; error_type: string | null; error_message: string | null;
  data_hash: string; row_count: number; code_hash: string; code_mode: string; assets: string | null;
};

type DiagramResult = { figureProjectId: string; figureVersionNumber: number; codeVersionId: string; runRecordId: string; asset: { id: string; format: "svg"; contentHash: string; fileSize: number }; code: string };

const initialRows = defaultM8FigureData();
const initialSpec: M8StatisticalFigureSpec = {
  kind: "statistical", chartType: "bar", title: "不同条件下的得分比较", xLabel: "实验条件", yLabel: "得分",
  caption: "图 1. 不同实验条件下得分的比较。", mapping: { category: "condition", value: "score" },
  publication: M8_PUBLICATION_PRESETS.paper_double_column,
};

const chartLabels: Record<string, string> = {
  histogram: "直方图", density: "密度图", boxplot: "箱线图", violin: "手提琴图", bar: "柱状图", point: "点图",
  errorbar: "误差线图", forest: "森林图", scatter: "散点图", bubble: "气泡图", regression: "回归图", line: "折线图",
  area: "面积图", heatmap: "热图", correlation_heatmap: "相关矩阵图", facet: "分面图", multi_panel: "多面板图",
};

export function ResearchFiguresWorkspace({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<M8DatasetRow[]>(initialRows);
  const [sourceText, setSourceText] = useState(toCsv(initialRows));
  const [sourceFilename, setSourceFilename] = useState("manual-data.csv");
  const [spec, setSpec] = useState<M8StatisticalFigureSpec>(initialSpec);
  const [code, setCode] = useState(() => buildM8PythonFigureCode(initialSpec));
  const [codeMode, setCodeMode] = useState<"managed" | "customized" | "forked">("managed");
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("导入数据、确认字段映射后运行；图片优先展示，代码默认折叠。");
  const [diagramType, setDiagramType] = useState<M8DiagramType>("theoretical_framework");
  const [diagramTitle, setDiagramTitle] = useState("研究框架与证据路径");
  const [diagramNodes, setDiagramNodes] = useState("question|研究问题\ntheory|理论框架\ndata|研究材料\nanalysis|分析过程\nclaim|研究结论");
  const [diagramEdges, setDiagramEdges] = useState("question|theory|界定\ntheory|analysis|指导\ndata|analysis|输入\nanalysis|claim|支持");
  const [diagramResult, setDiagramResult] = useState<DiagramResult | null>(null);
  const columns = useMemo(() => inferM8Columns(rows), [rows]);
  const recommendations = useMemo(() => recommendM8FigureTypes(columns), [columns]);

  useEffect(() => { void loadHistory(projectId, setHistory); }, [projectId]);

  function updateSpec(patch: Partial<M8StatisticalFigureSpec>) {
    const next = { ...spec, ...patch } as M8StatisticalFigureSpec;
    setSpec(next);
    setResult(null); setSelectedAssetId(null);
    if (codeMode === "managed") setCode(buildM8PythonFigureCode(next));
    else setMessage("当前代码已自定义。配置已更新，但不会静默覆盖代码；运行将创建新的代码版本。");
  }

  function changeType(type: M8ImplementedFigureType) {
    const mapping = defaultMapping(type, columns);
    updateSpec({ chartType: type, mapping } as Partial<M8StatisticalFigureSpec>);
  }

  function updateMapping(field: string, value: string) {
    updateSpec({ mapping: { ...(spec.mapping as Record<string, unknown>), [field]: value } } as Partial<M8StatisticalFigureSpec>);
  }

  function applyCsv(text: string, filename: string) {
    const parsed = parseCsv(text);
    if (!parsed.length) { setMessage("没有识别到带表头的数据行，请检查 CSV 内容。"); return; }
    setRows(parsed); setSourceText(text); setSourceFilename(filename); setResult(null); setSelectedAssetId(null);
    const nextColumns = inferM8Columns(parsed);
    const next = { ...spec, mapping: defaultMapping(spec.chartType as M8ImplementedFigureType, nextColumns) } as M8StatisticalFigureSpec;
    setSpec(next);
    if (codeMode === "managed") setCode(buildM8PythonFigureCode(next));
    setMessage(`已识别 ${parsed.length} 行、${nextColumns.length} 列；请确认字段映射。`);
  }

  async function runFigure() {
    setBusy(true); setMessage("正在固定数据快照、代码版本并调用本地受信任 Python Runner……");
    try {
      const response = await fetch(`/api/m8/projects/${projectId}/figures`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run", figure_project_id: result?.figureProjectId, specification: spec, data: rows, code: codeMode === "managed" ? undefined : code, source_type: "manual", original_filename: sourceFilename }),
      });
      const payload = await response.json() as { data?: RunResult; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "科研图件运行失败。");
      setResult(payload.data); setCode(payload.data.code); setCodeMode(payload.data.codeMode);
      const assetId = payload.data.assets.find((asset) => asset.format === "png")?.id ?? null; setSelectedAssetId(assetId);
      setMessage(payload.data.status === "succeeded" ? `运行成功：图件规格 V${payload.data.figureVersionNumber}，数据快照和代码版本均可追溯。` : `${payload.data.errorType ?? payload.data.status}：${payload.data.errorMessage ?? payload.data.stderr}`);
      await loadHistory(projectId, setHistory);
    } catch (error) { setMessage(error instanceof Error ? error.message : "科研图件运行失败。"); }
    finally { setBusy(false); }
  }

  async function runDiagram() {
    setBusy(true); setMessage("正在使用受控 SVG 模板生成概念图……");
    try {
      const nodes = diagramNodes.split(/\r?\n/u).filter(Boolean).map((line) => { const [id, ...label] = line.split("|"); return { id: id.trim(), label: label.join("|").trim() }; });
      const edges = diagramEdges.split(/\r?\n/u).filter(Boolean).map((line) => { const [source, target, ...label] = line.split("|"); return { source: source.trim(), target: target.trim(), label: label.join("|").trim() || undefined }; });
      const response = await fetch(`/api/m8/projects/${projectId}/diagrams`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ specification: { kind: "diagram", diagramType, title: diagramTitle, caption: `${diagramTitle}。`, nodes, edges } }) });
      const payload = await response.json() as { data?: DiagramResult; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "概念图生成失败。");
      setDiagramResult(payload.data); setMessage(`概念图 V${payload.data.figureVersionNumber} 已生成；SVG、代码版本和来源结构均可追溯。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "概念图生成失败。"); }
    finally { setBusy(false); }
  }

  function editCode(value: string) {
    setCode(value);
    if (codeMode === "managed") setCodeMode(result ? "forked" : "customized");
    setMessage("代码已自定义。后续配置变化不会覆盖它；再次运行会创建新 CodeVersion。");
  }

  function restoreManagedCode() {
    setCode(buildM8PythonFigureCode(spec)); setCodeMode("managed");
    setMessage("已创建新的托管代码草稿；历史自定义代码版本不会被删除。");
  }

  const imageUrl = selectedAssetId ? `/api/m8/projects/${projectId}/figures/assets/${selectedAssetId}` : null;
  return (
    <div className={styles.workspace}>
      <aside className={styles.controls}>
        <PanelTitle kicker="DATA & FIGURE" title="数据与图型" badge="M8.2" />
        <label className={styles.fileButton}>导入 CSV<input accept=".csv,text/csv" type="file" onChange={async (event) => { const file = event.target.files?.[0]; if (file) applyCsv(await file.text(), file.name); }} /></label>
        <label>数据表<textarea rows={7} value={sourceText} onChange={(event) => setSourceText(event.target.value)} onBlur={() => applyCsv(sourceText, sourceFilename)} /></label>
        <div className={styles.columns} aria-label="识别的数据列">{columns.map((column) => <span key={column.name}>{column.name}<small>{column.type}</small></span>)}</div>
        {recommendations.length ? <p className={styles.recommendation}>推荐：{recommendations.map((type) => chartLabels[type]).join("、")}。推荐不限制其他图型。</p> : null}
        <div className={styles.catalog}>{M8_FIGURE_CATALOG.map((group) => <section key={group.group}><h3>{group.label}</h3><div>{group.items.map((type) => {
          const enabled = M8_IMPLEMENTED_FIGURE_TYPES.includes(type as M8ImplementedFigureType);
          return <button className={spec.chartType === type ? styles.activeType : undefined} disabled={!enabled} key={type} onClick={() => enabled && changeType(type as M8ImplementedFigureType)} type="button">{chartLabels[type]}</button>;
        })}</div></section>)}</div>
        <MappingControls columns={columns} spec={spec} update={updateMapping} />
        <label>标题<input value={spec.title} onChange={(event) => updateSpec({ title: event.target.value })} /></label>
        <div className={styles.labelGrid}><label>X 轴<input value={spec.xLabel} onChange={(event) => updateSpec({ xLabel: event.target.value })} /></label><label>Y 轴<input value={spec.yLabel} onChange={(event) => updateSpec({ yLabel: event.target.value })} /></label></div>
        <label>出版预设<select value={spec.publication.preset} onChange={(event) => updateSpec({ publication: M8_PUBLICATION_PRESETS[event.target.value as keyof typeof M8_PUBLICATION_PRESETS] })}><option value="screen_preview">屏幕预览</option><option value="paper_single_column">论文单栏</option><option value="paper_double_column">论文双栏</option></select></label>
        <button className={styles.executeButton} disabled={busy} onClick={runFigure} type="button">{busy ? "正在运行 Python…" : "运行并创建 RunRecord"}</button>
        <p className={styles.boundary}>本地受信任执行模式 · 仅项目所有者可用 · 不是生产沙箱。Worker 只调用 Runner Adapter，不在 Web 进程执行 Python。</p>
        <fieldset className={styles.mapping}><legend>概念图件</legend><label>类型<select value={diagramType} onChange={(event) => setDiagramType(event.target.value as M8DiagramType)}><option value="mechanism_diagram">机制图</option><option value="theoretical_framework">理论框架图</option><option value="research_flow">研究流程图</option><option value="graphical_abstract">Graphical Abstract</option><option value="research_infographic">科研信息图</option></select></label><label>标题<input value={diagramTitle} onChange={(event) => setDiagramTitle(event.target.value)} /></label><label>节点（ID|标签）<textarea rows={5} value={diagramNodes} onChange={(event) => setDiagramNodes(event.target.value)} /></label><label>关系（起点|终点|标签）<textarea rows={4} value={diagramEdges} onChange={(event) => setDiagramEdges(event.target.value)} /></label><button className={styles.executeButton} disabled={busy} onClick={runDiagram} type="button">生成受控概念图</button><p className={styles.boundary}>参数化 SVG 渲染，不执行 Mermaid、Python、R 或 Shell；代码仅作为可查看的结构说明。</p></fieldset>
      </aside>

      <main className={styles.resultPanel}>
        <div className={styles.resultHeader}><div><span>FIGURE PREVIEW</span><h2>{result ? `科研图件 · V${result.figureVersionNumber}` : "图件预览"}</h2></div><strong>{result?.status ?? "等待运行"}</strong></div>
        <section className={styles.canvas}>{imageUrl && result?.assets[0] ? <Image alt={spec.title} height={result.assets[0].height} src={imageUrl} unoptimized width={result.assets[0].width} /> : <div className={styles.empty}><strong>{chartLabels[spec.chartType]}</strong><span>运行成功后在这里显示真实 PNG</span></div>}</section>
        <p className={styles.caption}>{spec.caption}</p>
        <div className={styles.message} role="status">{message}</div>
        {result ? <div className={styles.trace}><span>DataSnapshot <code>{short(result.dataSnapshotId)}</code>{result.dataSnapshotReused ? " · 复用" : " · 新建"}</span><span>CodeVersion <code>{short(result.codeVersionId)}</code>{result.codeVersionReused ? " · 复用" : " · 新建"}</span><span>RunRecord <code>{short(result.runRecordId)}</code></span></div> : null}
        <div className={styles.resultActions}>{result?.assets.length ? result.assets.map((asset) => <a download key={asset.id} href={`/api/m8/projects/${projectId}/figures/assets/${asset.id}`}>下载 {asset.format.toUpperCase()}</a>) : <span>暂无可下载资产</span>}<span>代码状态：{codeModeLabel(codeMode)}</span><span>{rows.length} 行 · {columns.length} 列</span></div>
        {result?.assets.length ? <details className={styles.historyPanel}><summary>资产清单 · {result.assets.length}</summary><div>{result.assets.map((asset) => <p key={asset.id}><strong>{asset.format.toUpperCase()}</strong> · {asset.fileSize} bytes · SHA-256 {asset.contentHash.slice(0, 12)}…</p>)}</div></details> : null}
        {diagramResult ? <section><div className={styles.resultHeader}><div><span>CONCEPTUAL FIGURE</span><h2>{diagramTitle} · V{diagramResult.figureVersionNumber}</h2></div><a download href={`/api/m8/projects/${projectId}/figures/assets/${diagramResult.asset.id}`}>下载 SVG</a></div><section className={styles.canvas}><Image alt={diagramTitle} height={620} src={`/api/m8/projects/${projectId}/figures/assets/${diagramResult.asset.id}`} unoptimized width={980} /></section><details className={styles.codePanel}><summary><span><strong>查看结构代码</strong><small>Mermaid 文本仅供查看，不在服务器执行</small></span><span>展开</span></summary><textarea aria-label="概念图结构代码" readOnly value={diagramResult.code} /></details></section> : null}
        <details className={styles.codePanel}><summary><span><strong>查看生成代码</strong><small>默认折叠 · Python · 可下载</small></span><span>展开</span></summary><div className={styles.codeToolbar}><label><input checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} type="checkbox" />高级编辑</label><button onClick={() => navigator.clipboard.writeText(code)} type="button">复制</button><button onClick={() => downloadText(code, `figure-${result?.codeVersionId ?? "draft"}.py`, "text/x-python")} type="button">下载 .py</button><button onClick={restoreManagedCode} type="button">从托管版本重新生成</button></div><textarea aria-label="Python 图件代码" readOnly={!advanced} spellCheck={false} value={code} onChange={(event) => editCode(event.target.value)} /><p>{advanced ? "编辑后将创建 customized/forked CodeVersion；安全检查仍会执行。" : "普通模式为只读。开启高级编辑后才能修改代码。"}</p></details>
        <details className={styles.historyPanel} open><summary>运行历史 · {history.length}</summary><div>{history.length ? history.map((run) => { const assetId = firstAssetId(run.assets); return <button key={run.id} onClick={() => assetId && setSelectedAssetId(assetId)} type="button"><span><strong>{run.status}</strong><small>{new Date(run.queued_at).toLocaleString("zh-CN")}</small></span><span>数据 {short(run.data_snapshot_id)} · 代码 {short(run.code_version_id)}</span><span>{run.error_type ?? (assetId ? "查看图件" : "无资产")}</span></button>; }) : <p>尚无运行记录。</p>}</div></details>
      </main>
    </div>
  );
}

function MappingControls({ columns, spec, update }: { columns: M8ColumnSchema[]; spec: M8StatisticalFigureSpec; update: (field: string, value: string) => void }) {
  const mapping = spec.mapping as Record<string, unknown>;
  const fields = mappingFields(spec.chartType as M8ImplementedFigureType);
  return <fieldset className={styles.mapping}><legend>字段映射</legend>{fields.map((field) => <label key={field.key}>{field.label}<select value={typeof mapping[field.key] === "string" ? mapping[field.key] as string : ""} onChange={(event) => update(field.key, event.target.value)}><option value="">请选择</option>{columns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}</select></label>)}</fieldset>;
}

function PanelTitle({ kicker, title, badge }: { kicker: string; title: string; badge: string }) { return <div className={styles.panelHeading}><div><span>{kicker}</span><h2>{title}</h2></div><strong>{badge}</strong></div>; }
function defaultMapping(type: M8ImplementedFigureType, columns: M8ColumnSchema[]): M8StatisticalFigureSpec["mapping"] { const numbers = columns.filter((column) => column.type === "number").map((column) => column.name); const numeric = numbers[0] ?? ""; const secondNumeric = numbers[1] ?? numeric; const category = columns.find((column) => column.type === "string" || column.type === "date")?.name ?? columns[0]?.name ?? ""; if (["histogram", "density"].includes(type)) return { value: numeric }; if (["scatter", "bubble", "regression"].includes(type)) return type === "bubble" ? { x: numeric, y: secondNumeric, size: numbers[2] ?? numeric } : type === "regression" ? { x: numeric, y: secondNumeric, model: "linear", showConfidenceInterval: true } : { x: numeric, y: secondNumeric }; if (["line", "area"].includes(type)) return { x: category, y: numeric }; if (type === "errorbar") return { category, estimate: numeric, error: secondNumeric }; if (type === "forest") return { label: category, estimate: numeric, lowerCI: secondNumeric, upperCI: numbers[2] ?? numeric }; if (type === "heatmap") return { x: category, y: columns.find((column) => column.name !== category && column.type === "string")?.name ?? category, value: numeric }; if (type === "correlation_heatmap") return { variables: numbers.slice(0, Math.max(2, numbers.length)) }; if (type === "facet") return { x: category, y: numeric, facetColumn: category, geometry: "bar" }; if (type === "multi_panel") return { panelSpecs: [{ figureType: "bar", mapping: { category, value: numeric } }, { figureType: "scatter", mapping: { x: numeric, y: secondNumeric } }] }; return { category, value: numeric }; }
function mappingFields(type: M8ImplementedFigureType): Array<{ key: string; label: string }> { if (["histogram", "density"].includes(type)) return [{ key: "value", label: "数值字段" }]; if (["scatter", "regression"].includes(type)) return [{ key: "x", label: "X 字段" }, { key: "y", label: "Y 字段" }]; if (type === "bubble") return [{ key: "x", label: "X 字段" }, { key: "y", label: "Y 字段" }, { key: "size", label: "气泡大小" }]; if (["line", "area"].includes(type)) return [{ key: "x", label: "X 字段" }, { key: "y", label: "Y 字段" }, { key: "group", label: "分组（可选）" }]; if (type === "errorbar") return [{ key: "category", label: "分类字段" }, { key: "estimate", label: "估计值" }, { key: "error", label: "误差值" }]; if (type === "forest") return [{ key: "label", label: "标签" }, { key: "estimate", label: "效应值" }, { key: "lowerCI", label: "置信区间下界" }, { key: "upperCI", label: "置信区间上界" }]; if (type === "heatmap") return [{ key: "x", label: "X 分类" }, { key: "y", label: "Y 分类" }, { key: "value", label: "数值字段" }]; if (["correlation_heatmap", "multi_panel"].includes(type)) return []; if (type === "facet") return [{ key: "x", label: "X 字段" }, { key: "y", label: "Y 字段" }, { key: "facetColumn", label: "分面字段" }]; return [{ key: "category", label: "分类字段" }, { key: "value", label: "数值字段" }]; }
function parseCsv(text: string): M8DatasetRow[] { const lines = text.split(/\r?\n/u).filter((line) => line.trim()); if (lines.length < 2) return []; const headers = parseCsvLine(lines[0]); return lines.slice(1).map((line) => { const cells = parseCsvLine(line); return Object.fromEntries(headers.map((header, index) => [header, parseCell(cells[index] ?? "")])); }); }
function parseCsvLine(line: string): string[] { const cells: string[] = []; let value = "", quoted = false; for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === "," && !quoted) { cells.push(value.trim()); value = ""; } else value += character; } cells.push(value.trim()); return cells; }
function parseCell(value: string): string | number | boolean | null { if (!value) return null; if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value); if (value === "true" || value === "false") return value === "true"; return value; }
function toCsv(rows: M8DatasetRow[]): string { const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]; return [headers.join(","), ...rows.map((row) => headers.map((header) => String(row[header] ?? "")).join(","))].join("\n"); }
async function loadHistory(projectId: string, setter: (value: RunHistory[]) => void) { try { const response = await fetch(`/api/m8/projects/${projectId}/figures`, { cache: "no-store" }); const payload = await response.json() as { data?: { runs?: RunHistory[] } }; if (response.ok) setter(payload.data?.runs ?? []); } catch { /* The page remains usable when history is temporarily unavailable. */ } }
function firstAssetId(value: string | null) { return value?.split(",")[0]?.split(":")[0] ?? null; }
function codeModeLabel(value: RunResult["codeMode"]) { return value === "managed" ? "自动托管" : value === "forked" ? "已分叉" : "已自定义"; }
function short(value: string) { return value.slice(0, 8); }
function downloadText(content: string, filename: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
