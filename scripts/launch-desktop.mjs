/**
 * Launch the Aegis Electron window as a fully detached process so it keeps
 * running after the terminal that started it is closed. The backend runtimes
 * (Hands/Atrium) are already detached by hatchery; this gives the desktop
 * window the same lifetime.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron"); // absolute path to the electron binary
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aegisDir = path.resolve(__dirname, "..", "aegis");

const child = spawn(electronPath, ["."], {
  cwd: aegisDir,
  detached: true,
  stdio: "ignore",
  windowsHide: false,
});
child.unref();

console.log(
  `[parix] Aegis desktop window launched (PID ${child.pid}). You can close this terminal.`,
);
process.exit(0);
