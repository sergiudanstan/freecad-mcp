import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export const MACOS_FREECAD_CMD = '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd';

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Which headless FreeCAD binary to run: FREECAD_CMD if set, else `freecadcmd`
 * found on PATH, else the macOS app bundle path.
 */
export function resolveFreecadCmd(
  env: NodeJS.ProcessEnv = process.env,
  isExec: (path: string) => boolean = isExecutable,
): string {
  if (env.FREECAD_CMD) return env.FREECAD_CMD;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, 'freecadcmd' + ext);
      if (isExec(candidate)) return candidate;
    }
  }
  return MACOS_FREECAD_CMD;
}
