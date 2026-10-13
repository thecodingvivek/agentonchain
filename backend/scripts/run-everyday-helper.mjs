import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(backendRoot, ".env.local");
if (existsSync(envFile)) {
  for (const [name, value] of Object.entries(parseEnv(readFileSync(envFile, "utf8")))) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

const child = spawn(process.execPath, [
  resolve(backendRoot, "node_modules/eve/bin/eve.js"),
  ...process.argv.slice(2),
], {
  cwd: resolve(backendRoot, "everyday-helper"),
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error("Could not start Everyday helper:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
