import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agents = [
  { name: "Agentonchain assistant", folder: ".", port: 2000 },
  { name: "Everyday helper", folder: "everyday-helper", port: 2001 },
  { name: "Chat agent", folder: "chat-agent", port: 2002 },
];

function checkPort(port) {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Port ${port} is unavailable. Stop the existing agent before running dev:all.`)));
    server.listen(port, "127.0.0.1", () => server.close(resolveCheck));
  });
}

try {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Use Node.js 24 or newer (nvm use).");
  const eveCli = resolve(backendRoot, "node_modules/eve/bin/eve.js");
  if (!existsSync(eveCli)) throw new Error("Install backend dependencies with npm install first.");
  const envFile = resolve(backendRoot, ".env.local");
  if (existsSync(envFile)) {
    for (const [name, value] of Object.entries(parseEnv(readFileSync(envFile, "utf8")))) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }
  // Check every port before starting any child; do not silently replace running agents.
  for (const { port } of agents) await checkPort(port);

  const children = new Set();
  let stopping = false;
  const stop = (code, signal = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill(signal);
    const forceStop = setTimeout(() => {
      for (const child of children) child.kill("SIGKILL");
    }, 5000);
    forceStop.unref();
  };
  process.on("SIGINT", () => stop(0, "SIGINT"));
  process.on("SIGTERM", () => stop(0));

  for (const agent of agents) {
    console.log(`Starting ${agent.name} at http://127.0.0.1:${agent.port}`);
    const child = spawn(process.execPath, [eveCli, "dev", "--host", "127.0.0.1", "--port", String(agent.port), "--no-ui"], {
      cwd: resolve(backendRoot, agent.folder), env: process.env, stdio: "inherit",
    });
    children.add(child);
    child.on("error", (error) => {
      console.error(`Could not start ${agent.name}: ${error.message}`);
      stop(1);
    });
    child.on("close", (code, signal) => {
      children.delete(child);
      if (!stopping) {
        console.error(`${agent.name} stopped (${signal ?? code}). Stopping the other agents.`);
        stop(code || 1);
      }
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
