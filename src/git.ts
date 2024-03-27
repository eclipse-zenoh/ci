import { sh } from "./command";

type CloneFromGitHubOptions = {
  branch?: string;
  token?: string;
  path?: string;
};

export function cloneFromGitHub(repo: string, options: CloneFromGitHubOptions) {
  const remote =
    options.token == undefined ? `https://github.com/${repo}.git` : `https://${options.token}@github.com/${repo}.git`;

  const command = ["git", "clone", "--recursive", "--single-branch"];
  if (options.branch != undefined) {
    command.concat("--branch", options.branch);
  }
  command.concat(remote);
  if (options.path != undefined) {
    command.concat(options.path);
  }

  sh(command.join(" "));
}

export function describe(path: string = process.cwd()): string {
  return sh("git describe", { cwd: path });
}
