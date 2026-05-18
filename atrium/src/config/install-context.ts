import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface InstallContext {
  os: "windows" | "macos" | "linux" | "docker" | string;
  distro?: string | null;
  arch: string;
  nodeVersion: string;
  pythonVersion: string;
  activeSkills: string[];
  detectedAt: string;
}

let _installContext: InstallContext | null = null;

function getParixHome(): string {
  return (
    process.env.PARIX_HOME ||
    resolve(process.env.HOME || process.env.USERPROFILE || "", ".parix")
  );
}

export function loadInstallContext(): InstallContext | null {
  const path = resolve(getParixHome(), "install-context.json");
  if (!existsSync(path)) return null;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as InstallContext;
    if (!Array.isArray(parsed.activeSkills)) return null;
    _installContext = parsed;
    return parsed;
  } catch (err) {
    console.warn(
      "[ATRIUM:INSTALL] Could not load install-context.json:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export function getInstallContext(): InstallContext | null {
  return _installContext;
}

export function getActiveSkills(): string[] {
  return _installContext?.activeSkills ?? [];
}
