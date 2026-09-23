#!/usr/bin/env node
// generate_wave_retrospective.js
// Queries GitHub API for closed milestone issues and outputs a markdown summary table.

const https = require("https");

const OWNER = process.env.REPO_OWNER || "kike-alt";
const REPO = process.env.REPO_NAME || "DeWordle";
const MILESTONE = process.env.MILESTONE_NUMBER || "1";
const TOKEN = process.env.GITHUB_TOKEN || "";

function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path,
      headers: {
        "User-Agent": "wave-retro-script",
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function main() {
  const issues = await get(
    `/repos/${OWNER}/${REPO}/issues?milestone=${MILESTONE}&state=closed&per_page=100`
  );

  if (!Array.isArray(issues)) {
    console.error("Error fetching issues:", issues);
    process.exit(1);
  }

  const contributors = {};
  const moduleAreas = {};

  for (const issue of issues) {
    const user = issue.user?.login || "unknown";
    contributors[user] = (contributors[user] || 0) + 1;

    const match = issue.title.match(/\(([^)]+)\)/);
    const area = match ? match[1] : "general";
    moduleAreas[area] = (moduleAreas[area] || 0) + 1;
  }

  const lines = [
    `# Wave ${MILESTONE} Retrospective Summary`,
    "",
    `**Total issues closed:** ${issues.length}`,
    "",
    "## Contributor Breakdown",
    "",
    "| Contributor | Issues Closed |",
    "| ----------- | ------------- |",
    ...Object.entries(contributors).map(([u, c]) => `| ${u} | ${c} |`),
    "",
    "## Issues by Module Area",
    "",
    "| Module | Count |",
    "| ------ | ----- |",
    ...Object.entries(moduleAreas).map(([m, c]) => `| ${m} | ${c} |`),
  ];

  console.log(lines.join("\n"));
}

main();