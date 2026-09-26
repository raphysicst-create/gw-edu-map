import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assertReleaseManifest, type ReleaseManifest } from "../../../src/lib/data/release";
import type { SourceRegister } from "./source-register";
import { readGangwonRegister, validateReleaseDirectory, withReleaseLock } from "./release";

const BACKUPS = "data/interim/gangwon/previous-releases";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject junctions/symlinks and verify containment before copying or moving directories. */
async function localDirectory(root: string, relative: string, create = false): Promise<string> {
  const base = await realpath(root);
  const destination = path.resolve(base, relative);
  const rest = path.relative(base, destination);
  if (!rest || rest.startsWith("..") || path.isAbsolute(rest)) throw new Error("작업 폴더 밖 복구 경로입니다.");
  let current = base;
  for (const part of rest.split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
      stat = await lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`일반 작업 폴더가 아닌 복구 경로: ${current}`);
  }
  return destination;
}

function backupRelative(id: string): string {
  if (!UUID.test(id)) throw new Error("백업 ID는 previous-releases 아래의 UUID 폴더명이어야 합니다.");
  return `${BACKUPS}/${id}`;
}

async function activeManifest(root: string): Promise<ReleaseManifest> {
  const active = await localDirectory(root, "public/data");
  const manifestPath = path.join(active, "manifest.json");
  const stat = await lstat(manifestPath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("현재 manifest는 일반 파일이어야 합니다.");
  const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  assertReleaseManifest(value);
  return value;
}

export async function previewRollback(root: string, register: SourceRegister, backupId: string) {
  const directory = await localDirectory(root, backupRelative(backupId));
  const target = await validateReleaseDirectory(directory, register);
  if (target.releaseStatus === "preparing") throw new Error("준비 상태 백업은 복구 대상으로 사용할 수 없습니다.");
  const current = await activeManifest(root);
  return { backupId, currentVersion: current.dataVersion, targetVersion: target.dataVersion, targetStatus: target.releaseStatus, fileCount: Object.keys(target.files).length };
}

/** Restore validated bytes; retain both the chosen backup and the displaced active release. */
export async function rollbackRelease(root: string, register: SourceRegister, backupId: string, expectedCurrentVersion: string) {
  if (!expectedCurrentVersion) throw new Error("복구 전 확인한 현재 dataVersion이 필요합니다.");
  const canonicalRoot = await realpath(root);
  await localDirectory(canonicalRoot, "data/interim/gangwon", true);
  return withReleaseLock(canonicalRoot, async () => {
    const preview = await previewRollback(canonicalRoot, register, backupId);
    if (preview.currentVersion !== expectedCurrentVersion) throw new Error("현재 공개 버전이 바뀌었습니다. 복구 미리보기를 다시 확인해 주세요.");
    if (preview.currentVersion === preview.targetVersion) throw new Error("이미 같은 데이터 버전이 공개되어 있습니다.");
    const source = await localDirectory(canonicalRoot, backupRelative(backupId));
    const manifest = await validateReleaseDirectory(source, register);
    const token = randomUUID();
    const stage = await localDirectory(canonicalRoot, `data/interim/gangwon/staging/${token}`, true);
    for (const file of Object.values(manifest.files)) {
      const target = path.join(stage, file.path);
      await localDirectory(canonicalRoot, path.relative(canonicalRoot, path.dirname(target)), true);
      await writeFile(target, await readFile(path.join(source, file.path)), { flag: "wx" });
    }
    await writeFile(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    await validateReleaseDirectory(stage, register);
    const active = await localDirectory(canonicalRoot, "public/data");
    const backups = await localDirectory(canonicalRoot, BACKUPS);
    const displaced = path.join(backups, token);
    // All paths are resolved within the workspace and all parent directories checked above.
    await rename(active, displaced);
    try { await rename(stage, active); }
    catch (error) {
      try { await rename(displaced, active); }
      catch (recoveryError) {
        throw new AggregateError([error, recoveryError], `복구 교체와 자동 되돌리기가 실패했습니다. 직전 공개본 보존 경로: ${displaced}`);
      }
      throw error;
    }
    return { ...preview, displacedBackupId: token };
  });
}

export async function runRollback(root: string, args: string[]): Promise<void> {
  if (args.length === 0 || (args.length === 1 && args[0] === "--list")) {
    let folder;
    try { folder = await localDirectory(root, BACKUPS); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { console.log("백업이 없습니다."); return; } throw error; }
    const ids = (await readdir(folder, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && UUID.test(entry.name)).map(entry => entry.name).sort();
    console.log("백업 ID 목록입니다. 복구 가능 여부는 --preview로 검증하세요.");
    for (const id of ids) console.log(id);
    return;
  }
  const previewOnly = args.length === 2 && args[0] === "--preview";
  const apply = args.length === 4 && args[0] === "--apply" && args[2] === "--current";
  if (!previewOnly && !apply) throw new Error("사용법: --list | --preview <백업ID> | --apply <백업ID> --current <현재dataVersion>");
  const register = await readGangwonRegister(root);
  const result = previewOnly ? await previewRollback(root, register, args[1]) : await rollbackRelease(root, register, args[1], args[3]);
  console.log(JSON.stringify({ mode: previewOnly ? "preview" : "restored", ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRollback(process.cwd(), process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
