// Lance l'API et le front Vite ensemble ; Ctrl+C arrête les deux.
import { spawn } from "node:child_process";

const procs = [
  ["api", ["run", "dev", "-w", "server"]],
  ["web", ["run", "dev", "-w", "web"]],
].map(([name, args]) => {
  const p = spawn("npm", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const prefix = (chunk) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  p.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  p.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  p.on("exit", (code) => {
    console.log(`[${name}] arrêté (code ${code})`);
    shutdown(code ?? 0);
  });
  return p;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
