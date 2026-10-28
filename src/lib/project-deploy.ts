import { ensureDirPath, getDirectoryAtPath } from "@/lib/workspace";

/** Öffentliche Website liegt immer in diesem Unterordner des Projektordners. */
export const PROJECT_DEPLOY_DIR = "deploy";

export function projectDeployRelativePath(): string {
  return PROJECT_DEPLOY_DIR;
}

export async function ensureProjectDeployDir(
  workspace: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return ensureDirPath(workspace, PROJECT_DEPLOY_DIR);
}

export async function projectDeployHasSite(workspace: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const dir = await getDirectoryAtPath(workspace, PROJECT_DEPLOY_DIR);
    await (await dir.getFileHandle("index.html")).getFile();
    return true;
  } catch {
    return false;
  }
}
