import fs from "node:fs";
import vm from "node:vm";

const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const failures = [];
const ok = (name, condition, detail = "") => {
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  else console.log(`✓ ${name}`);
};

function checkJs(name, source) {
  try {
    new vm.Script(source, { filename: name });
    ok(`Syntaxe ${name}`, true);
  } catch (error) {
    ok(`Syntaxe ${name}`, false, error.message);
  }
}

checkJs("app.js", read("app.js"));
checkJs("sw.js", read("sw.js"));

for (const page of ["employee.html", "pilotage.html"]) {
  const html = read(page);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  scripts.forEach((source, i) => checkJs(`${page} inline #${i + 1}`, source));

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  ok(`IDs uniques ${page}`, new Set(ids).size === ids.length);
}

for (const manifest of ["manifest-employee.json", "manifest-pilotage.json"]) {
  try {
    JSON.parse(read(manifest));
    ok(`JSON valide ${manifest}`, true);
  } catch (error) {
    ok(`JSON valide ${manifest}`, false, error.message);
  }
}

const sw = read("sw.js");
const assetMatch = sw.match(/const ASSETS=\[(.*?)\];/s);
if (assetMatch) {
  const assets = [...assetMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const asset of assets) {
    const path = asset.replace(/^\.\//, "").split("?")[0] || "index.html";
    ok(`Asset SW présent: ${path}`, exists(path));
  }
}

const forbiddenRoot = [
  ".DS_Store",
  "admin.html",
  "manifest-emma.json",
  "manifest-julie.json",
  "manifest-marc.json",
  "manifest-thomas.json",
  "manifest-patrick.json",
  "manifest-jerome.json",
  "manifest-paul.json",
  "manifest-louis.json",
  "manifest.json",
];
for (const path of forbiddenRoot) ok(`Absent: ${path}`, !exists(path));

const publicFiles = ["config.js", "app.js", "employee.html", "pilotage.html", "sw.js"];
const forbiddenSecrets = [
  /sb_secret_/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/i,
  /VAPID_PRIVATE_KEY\s*[:=]\s*["'][^"']+/i,
  /CRON_SECRET\s*[:=]\s*["'][^"']+/i,
];
for (const path of publicFiles) {
  const source = read(path);
  ok(`Pas de secret serveur dans ${path}`, !forbiddenSecrets.some((re) => re.test(source)));
}

if (failures.length) {
  console.error("\nÉchecs:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("\nTous les contrôles statiques sont passés.");
