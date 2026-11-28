/**
 * Local dev bootstrap: sync API port → frontend .env.local and free dev ports (Windows).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendEnvPath = path.join(root, "backend", ".env");
const frontendEnvPath = path.join(root, "frontend", ".env.local");
const FRONTEND_PORT = 3000;

function readBackendPort() {
  if (!fs.existsSync(backendEnvPath)) {
    console.warn("[prepare-dev] backend/.env missing — using PORT=5000");
    return 5000;
  }
  const text = fs.readFileSync(backendEnvPath, "utf8");
  const match = text.match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : 5000;
}

function syncFrontendApiUrl(port) {
  const apiLine = `NEXT_PUBLIC_API_URL=http://localhost:${port}/api/v1`;
  let content = "";
  if (fs.existsSync(frontendEnvPath)) {
    content = fs.readFileSync(frontendEnvPath, "utf8");
    if (/^\s*NEXT_PUBLIC_API_URL\s*=/m.test(content)) {
      content = content.replace(/^\s*NEXT_PUBLIC_API_URL\s*=.*$/m, apiLine);
    } else {
      content = `${apiLine}\n${content}`;
    }
  } else {
    const example = path.join(root, "frontend", ".env.example");
    content = fs.existsSync(example)
      ? fs.readFileSync(example, "utf8")
      : "";
    if (/^\s*NEXT_PUBLIC_API_URL\s*=/m.test(content)) {
      content = content.replace(/^\s*NEXT_PUBLIC_API_URL\s*=.*$/m, apiLine);
    } else {
      content = `${apiLine}\n${content}`;
    }
  }
  fs.writeFileSync(frontendEnvPath, content.replace(/\r?\n/g, "\n"));
  console.log(`[prepare-dev] frontend .env.local → ${apiLine}`);
}

function freePort(port) {
  if (process.platform !== "win32") {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        stdio: "ignore",
        shell: true,
      });
    } catch {
      /* port free */
    }
    return;
  }

  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`[prepare-dev] freed port ${port} (PID ${pid})`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* nothing listening */
  }
}

const backendPort = readBackendPort();
syncFrontendApiUrl(backendPort);
freePort(FRONTEND_PORT);
freePort(backendPort);
console.log("[prepare-dev] ready");