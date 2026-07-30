import type { M8DiagramFigureSpec } from "./m8-figure-contracts";

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/u;

export function validateM8DiagramSpec(spec: M8DiagramFigureSpec): string[] {
  const errors: string[] = [];
  if (!spec.title.trim()) errors.push("概念图标题不能为空。");
  if (spec.nodes.length < 2 || spec.nodes.length > 30) errors.push("概念图必须包含 2—30 个节点。");
  if (spec.edges.length < 1 || spec.edges.length > 60) errors.push("概念图必须包含 1—60 条关系。");
  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!ID_PATTERN.test(node.id) || ids.has(node.id)) errors.push(`节点 ID 无效或重复：${node.id}。`);
    if (!node.label.trim() || node.label.length > 100) errors.push(`节点 ${node.id} 的标签必须为 1—100 字符。`);
    ids.add(node.id);
  }
  for (const edge of spec.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`关系 ${edge.source} → ${edge.target} 指向不存在的节点。`);
    if (edge.label && edge.label.length > 80) errors.push("关系标签不得超过 80 字符。");
  }
  return errors;
}

export function buildM8DiagramMermaid(spec: M8DiagramFigureSpec): string {
  return [
    "flowchart LR",
    ...spec.nodes.map((node) => `  ${node.id}[\"${mermaidText(node.label)}\"]`),
    ...spec.edges.map((edge) => `  ${edge.source} -->${edge.label ? `|${mermaidText(edge.label)}|` : ""} ${edge.target}`),
  ].join("\n");
}

export function renderM8DiagramSvg(spec: M8DiagramFigureSpec): Uint8Array {
  const errors = validateM8DiagramSpec(spec);
  if (errors.length) throw new Error(errors.join("；"));
  const columns = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(spec.nodes.length))));
  const rows = Math.ceil(spec.nodes.length / columns);
  const nodeWidth = 220;
  const nodeHeight = 76;
  const gapX = 80;
  const gapY = 88;
  const margin = 70;
  const width = margin * 2 + columns * nodeWidth + (columns - 1) * gapX;
  const height = margin * 2 + rows * nodeHeight + (rows - 1) * gapY + 50;
  const positions = new Map(spec.nodes.map((node, index) => [node.id, {
    x: margin + (index % columns) * (nodeWidth + gapX),
    y: margin + Math.floor(index / columns) * (nodeHeight + gapY) + 50,
  }]));
  const edges = spec.edges.map((edge) => {
    const source = positions.get(edge.source)!;
    const target = positions.get(edge.target)!;
    const x1 = source.x + nodeWidth / 2;
    const y1 = source.y + nodeHeight / 2;
    const x2 = target.x + nodeWidth / 2;
    const y2 = target.y + nodeHeight / 2;
    return `<g><path d="M ${x1} ${y1} L ${x2} ${y2}" class="edge" marker-end="url(#arrow)"/>${edge.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" class="edge-label">${xml(edge.label)}</text>` : ""}</g>`;
  }).join("");
  const nodes = spec.nodes.map((node) => {
    const position = positions.get(node.id)!;
    return `<g><rect x="${position.x}" y="${position.y}" width="${nodeWidth}" height="${nodeHeight}" rx="18" class="node"/><text x="${position.x + nodeWidth / 2}" y="${position.y + nodeHeight / 2 + 6}" text-anchor="middle" class="node-label">${xml(node.label)}</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${xml(spec.title)}</title><desc id="desc">${xml(spec.caption)}</desc><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#14543A"/></marker></defs><style>.background{fill:#FFFDF7}.title{font:700 26px sans-serif;fill:#00392E}.node{fill:#D7EADA;stroke:#14543A;stroke-width:2}.node-label{font:600 16px sans-serif;fill:#00392E}.edge{stroke:#14543A;stroke-width:2;fill:none}.edge-label{font:13px sans-serif;fill:#185208;paint-order:stroke;stroke:#FFFDF7;stroke-width:5}</style><rect class="background" width="100%" height="100%"/><text x="${margin}" y="42" class="title">${xml(spec.title)}</text>${edges}${nodes}</svg>`;
  return new TextEncoder().encode(svg);
}

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function mermaidText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', "&quot;").replaceAll("\n", " ");
}
