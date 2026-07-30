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
    `output_formats = ${JSON.stringify(publication.outputFormats)}`,
    "for output_format in output_formats:",
    `    save_options = {'dpi': ${publication.dpi}, 'bbox_inches': 'tight', 'facecolor': ${pythonString(publication.background === "paper" ? "#FFFDF7" : publication.background === "white" ? "white" : "none")}, 'transparent': ${publication.background === "transparent" ? "True" : "False"}}`,
    "    if output_format == 'tiff': save_options['pil_kwargs'] = {'compression': 'tiff_lzw'}",
    "    fig.savefig(output_dir / f'figure.{output_format}', format=output_format, **save_options)",
    "plt.close(fig)",
    "",
  ].join("\n");
}

function buildChartBody(type: M8ImplementedFigureType, mapping: Record<string, unknown>): string {
  if (type === "histogram") {
    return [`value_column = ${pythonString(String(mapping.value))}`, "values = pd.to_numeric(frame[value_column], errors='coerce').dropna()", "ax.hist(values, bins='auto', color=colors[0], edgecolor='white', alpha=0.88)"].join("\n");
  }
  if (type === "density") {
    return [`value_column = ${pythonString(String(mapping.value))}`, "values = pd.to_numeric(frame[value_column], errors='coerce').dropna().to_numpy()", "counts, edges = np.histogram(values, bins=max(5, min(30, int(np.sqrt(len(values))))), density=True)", "centers = (edges[:-1] + edges[1:]) / 2", "smooth_x = np.linspace(edges[0], edges[-1], 240)", "smooth_y = np.interp(smooth_x, centers, counts)", "kernel = np.ones(9) / 9", "smooth_y = np.convolve(smooth_y, kernel, mode='same')", "ax.plot(smooth_x, smooth_y, color=colors[0])", "ax.fill_between(smooth_x, smooth_y, color=colors[0], alpha=0.22)"].join("\n");
  }
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
  if (type === "point") {
    return [`category_column = ${pythonString(String(mapping.category))}`, `value_column = ${pythonString(String(mapping.value))}`, "positions = np.arange(len(frame))", "ax.scatter(positions, pd.to_numeric(frame[value_column]), color=colors[0])", "ax.set_xticks(positions, frame[category_column].astype(str))"].join("\n");
  }
  if (type === "errorbar") {
    const error = typeof mapping.error === "string" ? mapping.error : "";
    const lower = typeof mapping.lower === "string" ? mapping.lower : "";
    const upper = typeof mapping.upper === "string" ? mapping.upper : "";
    return [`category_column = ${pythonString(String(mapping.category))}`, `estimate_column = ${pythonString(String(mapping.estimate))}`, `error_column = ${pythonString(error)}`, `lower_column = ${pythonString(lower)}`, `upper_column = ${pythonString(upper)}`, "estimate = pd.to_numeric(frame[estimate_column])", "if error_column:", "    errors = pd.to_numeric(frame[error_column])", "    yerr = errors", "else:", "    lower = pd.to_numeric(frame[lower_column])", "    upper = pd.to_numeric(frame[upper_column])", "    yerr = np.vstack([estimate - lower, upper - estimate])", "positions = np.arange(len(frame))", "ax.errorbar(positions, estimate, yerr=yerr, fmt='o', color=colors[0], capsize=4)", "ax.set_xticks(positions, frame[category_column].astype(str))"].join("\n");
  }
  if (type === "forest") {
    return [`label_column = ${pythonString(String(mapping.label))}`, `estimate_column = ${pythonString(String(mapping.estimate))}`, `lower_column = ${pythonString(String(mapping.lowerCI))}`, `upper_column = ${pythonString(String(mapping.upperCI))}`, "estimate = pd.to_numeric(frame[estimate_column])", "lower = pd.to_numeric(frame[lower_column])", "upper = pd.to_numeric(frame[upper_column])", "positions = np.arange(len(frame))", "ax.errorbar(estimate, positions, xerr=np.vstack([estimate - lower, upper - estimate]), fmt='o', color=colors[0], capsize=3)", "ax.axvline(0, color='#636363', linestyle='--', linewidth=1)", "ax.set_yticks(positions, frame[label_column].astype(str))", "ax.invert_yaxis()"].join("\n");
  }
  if (type === "bubble") {
    return [`x_column = ${pythonString(String(mapping.x))}`, `y_column = ${pythonString(String(mapping.y))}`, `size_column = ${pythonString(String(mapping.size))}`, "sizes = pd.to_numeric(frame[size_column], errors='coerce').fillna(0).abs()", "sizes = 30 + 270 * (sizes - sizes.min()) / max(float(sizes.max() - sizes.min()), 1.0)", "ax.scatter(pd.to_numeric(frame[x_column]), pd.to_numeric(frame[y_column]), s=sizes, color=colors[0], alpha=0.58, edgecolor='white')"].join("\n");
  }
  if (type === "regression") {
    const degree = mapping.model === "quadratic" ? 2 : 1;
    return [`x_column = ${pythonString(String(mapping.x))}`, `y_column = ${pythonString(String(mapping.y))}`, "x_values = pd.to_numeric(frame[x_column], errors='coerce').to_numpy()", "y_values = pd.to_numeric(frame[y_column], errors='coerce').to_numpy()", "valid = np.isfinite(x_values) & np.isfinite(y_values)", "x_values, y_values = x_values[valid], y_values[valid]", `coefficients = np.polyfit(x_values, y_values, ${degree})`, "fit_x = np.linspace(x_values.min(), x_values.max(), 200)", "fit_y = np.polyval(coefficients, fit_x)", "ax.scatter(x_values, y_values, color=colors[0], alpha=0.7)", "ax.plot(fit_x, fit_y, color=colors[1])"].join("\n");
  }
  if (type === "area") {
    return [`x_column = ${pythonString(String(mapping.x))}`, `y_column = ${pythonString(String(mapping.y))}`, "x_values = frame[x_column]", "y_values = pd.to_numeric(frame[y_column])", "ax.plot(x_values, y_values, color=colors[0])", "ax.fill_between(x_values, y_values, color=colors[0], alpha=0.28)"].join("\n");
  }
  if (type === "heatmap") {
    return [`x_column = ${pythonString(String(mapping.x))}`, `y_column = ${pythonString(String(mapping.y))}`, `value_column = ${pythonString(String(mapping.value))}`, "matrix = frame.pivot_table(index=y_column, columns=x_column, values=value_column, aggfunc='mean')", "image = ax.imshow(matrix.to_numpy(dtype=float), cmap='YlGn', aspect='auto')", "ax.set_xticks(np.arange(len(matrix.columns)), matrix.columns.astype(str))", "ax.set_yticks(np.arange(len(matrix.index)), matrix.index.astype(str))", "fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)"].join("\n");
  }
  if (type === "correlation_heatmap") {
    const variables = Array.isArray(mapping.variables) ? mapping.variables.map(String) : [];
    return [`variables = ${JSON.stringify(variables)}`, "matrix = frame[variables].apply(pd.to_numeric, errors='coerce').corr()", "image = ax.imshow(matrix.to_numpy(dtype=float), cmap='RdBu_r', vmin=-1, vmax=1)", "ax.set_xticks(np.arange(len(variables)), variables, rotation=35, ha='right')", "ax.set_yticks(np.arange(len(variables)), variables)", "for row in range(len(variables)):", "    for column in range(len(variables)):", "        ax.text(column, row, f'{matrix.iloc[row, column]:.2f}', ha='center', va='center', fontsize=7)", "fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)"].join("\n");
  }
  if (type === "facet") {
    const facet = typeof mapping.facetColumn === "string" ? mapping.facetColumn : typeof mapping.facetRow === "string" ? mapping.facetRow : "";
    return [`x_column = ${pythonString(String(mapping.x))}`, `y_column = ${pythonString(String(mapping.y))}`, `facet_column = ${pythonString(facet)}`, "groups = list(frame.groupby(facet_column, sort=False))", "fig.clear()", "axes = np.atleast_1d(fig.subplots(1, len(groups), squeeze=False)[0])", "for index, (name, group) in enumerate(groups):", "    panel = axes[index]", "    panel.scatter(group[x_column], pd.to_numeric(group[y_column]), color=colors[index % len(colors)])", "    panel.set_title(str(name))", "    panel.spines[['top', 'right']].set_visible(False)", "ax = axes[-1]"].join("\n");
  }
  if (type === "multi_panel") {
    const panels = Array.isArray(mapping.panelSpecs) ? mapping.panelSpecs : [];
    const safePanels = panels.slice(0, 4).map((panel) => panel && typeof panel === "object" ? panel : {});
    return [`panel_specs = ${JSON.stringify(safePanels)}`, "fig.clear()", "axes = np.atleast_1d(fig.subplots(1, len(panel_specs), squeeze=False)[0])", "for index, panel_spec in enumerate(panel_specs):", "    panel = axes[index]", "    panel_mapping = panel_spec.get('mapping', {})", "    panel_type = panel_spec.get('figureType', 'scatter')", "    if panel_type == 'bar':", "        panel.bar(frame[str(panel_mapping['category'])].astype(str), pd.to_numeric(frame[str(panel_mapping['value'])]), color=colors[index % len(colors)])", "    elif panel_type == 'line':", "        panel.plot(frame[str(panel_mapping['x'])], pd.to_numeric(frame[str(panel_mapping['y'])]), color=colors[index % len(colors)], marker='o')", "    else:", "        panel.scatter(pd.to_numeric(frame[str(panel_mapping['x'])]), pd.to_numeric(frame[str(panel_mapping['y'])]), color=colors[index % len(colors)])", "    panel.set_title(f'Panel {chr(65 + index)}')", "    panel.spines[['top', 'right']].set_visible(False)", "ax = axes[-1]"].join("\n");
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
