import { spawn } from "node:child_process";

const processes = [
  {
    name: "api",
    command: "node",
    args: ["dist/server/index.js"]
  },
  {
    name: "web",
    command: "pnpm",
    args: ["exec", "vite", "--host", "127.0.0.1", "--port", "5173"]
  }
];

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      LITERATE_NOTING_PORT: process.env.LITERATE_NOTING_PORT ?? "8787"
    }
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      return;
    }

    process.stderr.write(`[${name}] exited with code ${code ?? 0}\n`);
    shutdown();
    process.exit(code ?? 0);
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});
