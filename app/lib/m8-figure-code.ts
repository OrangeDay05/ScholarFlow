import type {
  M8DatasetRow,
  M8ImplementedFigureType,
  M8StatisticalFigureSpec,
} from "./m8-figure-contracts";

const palettes = {
  default: ["#14543A", "#348E38", "#007746", "#7EBD9E"],
  colorblind_safe: ["#0072B2", "#E69F00", "#009E73", "#CC79A7"],
  grayscale: ["#252525", "#636363", "#969696", "#cccccc"],
  high_contrast: ["#00392E", "#FADF2E", "#185208", "#D7EADA"],
} as const;

export function buildM8PythonFigureCode(spec: M8StatisticalFigureSpec): string {
  const mapping = spec.mapping as Record<string, unknown>;
  const publication = spec.publication;
  const palette = palettes[publication.colorPalette];
  const body = buildChartBody(spec.chartType as M8ImplementedFigureType, mapping);
  return [
    "from __future__ import annotations",
    "import argparse",
    "import json",
    "from pathlib import Path",
    "import random",
    "import matplotlib",
    "matplotlib.use('Agg')",
    "import matplotlib.pyplot as plt",
    "import numpy as np",
    "import pandas as pd",
    "",
    "RANDOM_SEED = 42",
    "random.seed(RANDOM_SEED)",
    "np.random.seed(RANDOM_SEED)",
    "parser = argparse.ArgumentParser()",
    "parser.add_argument('--data', required=True)",
    "parser.add_argument('--output-dir', required=True)",
    "args = parser.parse_args()",
    "data_path = Path(args.data)",
    "output_dir = Path(args.output_dir)",
    "output_dir.mkdir(parents=True, exist_ok=True)",
    "data = json.loads(data_path.read_text(encoding='utf-8'))",
    "frame = pd.DataFrame(data)",
    `colors = ${JSON.stringify(palette)}`,
    `plt.rcParams.update({'font.family': 'sans-serif', 'font.sans-serif': ['Microsoft YaHei', 'SimHei', 'Noto Sans CJK SC', 'Arial Unicode MS', 'DejaVu Sans'], 'axes.unicode_minus': False, 'font.size': ${publication.baseFontSize}, 'axes.titlesize': ${publication.titleFontSize}, 'axes.labelsize': ${publication.axisFontSize}, 'legend.fontsize': ${publication.legendFontSize}, 'lines.linewidth': ${publication.lineWidth}, 'lines.markersize': ${publication.markerSize}})`,
    `fig, ax = plt.subplots(figsize=(${publication.width}, ${publication.height}))`,
    body,
    `ax.set_title(${pythonString(spec.title)}, loc='left', fontweight='bold')`,
    `ax.set_xlabel(${pythonString(spec.xLabel)})`,
    `ax.set_ylabel(${pythonString(spec.yLabel)})`,
    "ax.spines[['top', 'right']].set_visible(False)",
    "ax.grid(axis='y', color='#D7EADA', linewidth=0.8, alpha=0.75)",
    "fig.tight_layout()",
    `fig.savefig(output_dir / 'figure.png', dpi=${publication.dpi}, bbox_inches='tight', facecolor=${pythonString(publication.background === "paper" ? "#FFFDF7" : publication.background === "white" ? "white" : "none")}, transparent=${publication.background === "transparent" ? "True" : "False"})`,
    "plt.close(fig)",
    "",
  ].join("\n");
}

function buildChartBody(type: M8ImplementedFigureType, mapping: Record<string, unknown>): string {
  if (type === "scatter") {
    return [
      `x_column = ${pythonString(String(mapping.x))}`,
      `y_column = ${pythonString(String(mapping.y))}`,
      "ax.scatter(pd.to_numeric(frame[x_column]), pd.to_numeric(frame[y_column]), color=colors[0], alpha=0.82)",
    ].join("\n");
  }
  if (type === "line") {
    const group = typeof mapping.group === "string" ? mapping.group : "";
    return [
      `x_column = ${pythonString(String(mapping.x))}`,
      `y_column = ${pythonString(String(mapping.y))}`,
      `group_column = ${pythonString(group)}`,
      "if group_column:",
      "    for index, (series_name, group) in enumerate(frame.groupby(group_column, sort=False)):",
      "        ax.plot(group[x_column], pd.to_numeric(group[y_column]), marker='o', label=str(series_name), color=colors[index % len(colors)])",
      "    ax.legend(frameon=False)",
      "else:",
      "    ax.plot(frame[x_column], pd.to_numeric(frame[y_column]), marker='o', color=colors[0])",
    ].join("\n");
  }
  if (type === "bar") {
    return [
      `category_column = ${pythonString(String(mapping.category))}`,
      `value_column = ${pythonString(String(mapping.value))}`,
      "ax.bar(frame[category_column].astype(str), pd.to_numeric(frame[value_column]), color=[colors[index % len(colors)] for index in range(len(frame))])",
    ].join("\n");
  }
  const category = pythonString(String(mapping.category));
  const value = pythonString(String(mapping.value));
  if (type === "boxplot") {
    return [
      `category_column = ${category}`,
      `value_column = ${value}`,
      "grouped = list(frame.groupby(category_column, sort=False))",
      "groups = [pd.to_numeric(group[value_column]).dropna().to_numpy() for _, group in grouped]",
      "labels = [str(name) for name, _ in grouped]",
      "box = ax.boxplot(groups, tick_labels=labels, patch_artist=True)",
      "for index, patch in enumerate(box['boxes']): patch.set_facecolor(colors[index % len(colors)])",
    ].join("\n");
  }
  return [
    `category_column = ${category}`,
    `value_column = ${value}`,
    "grouped = list(frame.groupby(category_column, sort=False))",
    "groups = [pd.to_numeric(group[value_column]).dropna().to_numpy() for _, group in grouped]",
    "labels = [str(name) for name, _ in grouped]",
    "parts = ax.violinplot(groups, showmeans=True, showextrema=True)",
    "for index, violin_body in enumerate(parts['bodies']):",
    "    violin_body.set_facecolor(colors[index % len(colors)])",
    "    violin_body.set_edgecolor(colors[0])",
    "    violin_body.set_alpha(0.68)",
    "ax.set_xticks(range(1, len(labels) + 1), labels)",
  ].join("\n");
}

export function defaultM8FigureData(): M8DatasetRow[] {
  return [
    { condition: "组 A", score: 24, time: 1 },
    { condition: "组 A", score: 28, time: 2 },
    { condition: "组 A", score: 31, time: 3 },
    { condition: "组 B", score: 29, time: 1 },
    { condition: "组 B", score: 34, time: 2 },
    { condition: "组 B", score: 38, time: 3 },
  ];
}

function pythonString(value: string): string {
  return JSON.stringify(value.replaceAll("\u2028", " ").replaceAll("\u2029", " "));
}
