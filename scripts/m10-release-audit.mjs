import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenPaths = tracked.filter((path) => /(^|\/)(node_modules|\.next|\.wrangler|coverage|tmp|logs?)(\/|$)|\.pid$|\.log$/iu.test(path));
const secretPattern = /(sk-[a-z0-9_-]{20,}|api[_-]?key\s*[=:]\s*["'][^"']{12,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/iu;
const secretHits = [];
for (const path of tracked) {
  if (/\.(png|jpe?g|gif|webp|pptx|docx|pdf|tiff|woff2?)$/iu.test(path) || statSync(path).size > 2_000_000) continue;
  const content = readFileSync(path, "utf8").replaceAll('"must-not-be-accepted"', '"x"');
  if (secretPattern.test(content)) secretHits.push(path);
}
if (forbiddenPaths.length || secretHits.length) {
  console.error(JSON.stringify({ forbiddenPaths, secretHits }, null, 2)); process.exit(1);
}
const migrations = tracked.filter((path) => /^drizzle\/\d{4}_.+\.sql$/u.test(path)).sort();
console.log(JSON.stringify({ status: "PASS", trackedFiles: tracked.length, migrations: migrations.length, latestMigration: migrations.at(-1), forbiddenPaths: 0, secretHits: 0 }, null, 2));
