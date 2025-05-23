import { sh } from "./command";

type CloneFromGitHubOptions = {
  branchOrHash?: string;
  token?: string;
  path?: string;
};

export function cloneFromGitHub(repo: string, options: CloneFromGitHubOptions) {
  const remote =
    options.token == undefined ? `https://github.com/${repo}.git` : `https://${options.token}@github.com/${repo}.git`;

  const clone = ["git", "clone", "--recursive"];
  let reset: string[] | undefined;
  if (options.branchOrHash != undefined) {
    if (isCommitHash(options.branchOrHash)) {
      reset = ["git", "reset", "--hard", options.branchOrHash];
    } else {
      clone.push("--branch", options.branchOrHash);
    }
  }
  clone.push(remote);
  if (options.path != undefined) {
    clone.push(options.path);
  }

  sh(clone.join(" "));

  if (reset != undefined) {
    sh(reset.join(" "), { cwd: repo || options.path });
  }
}

export function describe(path: string = process.cwd()): string {
  return sh("git describe", { cwd: path }).trim();
}

export function isCommitHash(str: string): boolean {
  return /^[0-9a-f]{7,40}$/.test(str);
}
