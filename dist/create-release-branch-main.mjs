// src/create-release-branch.ts
import { rm } from "fs/promises";
import * as core2 from "@actions/core";

// src/command.ts
import { spawnSync } from "child_process";
import * as core from "@actions/core";
var MAX_BUFFER = 10 * 1024 * 1024;
function sh(cmd, options) {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";
  options.quiet = options.quiet != null ? options.quiet : false;
  core.startGroup(`\x1B[1m\x1B[35m${cmd}\x1B[0m`);
  const returns = spawnSync(cmd, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring order is important
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "pipe",
    shell: true,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER
  });
  if (returns.stdout != "" && !options.quiet) {
    core.info(`\x1B[1mstdout:\x1B[0m`);
    core.info(returns.stdout);
  }
  if (returns.stderr != "" && !options.quiet) {
    core.info(`\x1B[1mstderr:\x1B[0m`);
    core.info(returns.stderr);
  }
  core.endGroup();
  if (options.check && returns.status != 0) {
    throw new Error(`\`${cmd}\` failed with status code ${returns.status}:
${returns.stderr}`);
  }
  return returns.stdout;
}

// src/git.ts
function cloneFromGitHub(repo, options) {
  const remote = options.token == void 0 ? `https://github.com/${repo}.git` : `https://${options.token}@github.com/${repo}.git`;
  const command = ["git", "clone", "--recursive"];
  if (options.branch != void 0) {
    command.push("--branch", options.branch);
  }
  command.push(remote);
  if (options.path != void 0) {
    command.push(options.path);
  }
  sh(command.join(" "));
}

// src/create-release-branch.ts
var DEFAULT_DRY_RUN_HISTORY_SIZE = 5;
function setup() {
  const version = core2.getInput("version");
  const liveRun = core2.getBooleanInput("live-run", { required: true });
  const dryRunHistorySize = core2.getInput("dry-run-history-size", { required: false });
  const repo = core2.getInput("repo", { required: true });
  const branch = core2.getInput("branch", { required: false });
  const githubToken = core2.getInput("github-token", { required: true });
  return {
    version: version === "" ? void 0 : version,
    liveRun,
    repo,
    branch: branch === "" ? void 0 : branch,
    githubToken,
    dryRunHistorySize: dryRunHistorySize == "" ? DEFAULT_DRY_RUN_HISTORY_SIZE : Number(dryRunHistorySize)
  };
}
async function main(input) {
  try {
    const repo = input.repo.split("/")[1];
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    cloneFromGitHub(input.repo, { token: input.githubToken, branch: input.branch });
    const version = input.version ?? sh("git describe", { cwd: repo }).trimEnd();
    core2.setOutput("version", version);
    let branch;
    if (input.liveRun) {
      branch = `release/${version}`;
      core2.setOutput("branch", branch);
    } else {
      branch = `release/dry-run/${version}`;
      core2.setOutput("branch", branch);
      const branchPattern = "refs/remotes/origin/release/dry-run";
      const branchesRaw = sh(`git for-each-ref --format='%(refname:strip=3)' --sort=authordate ${branchPattern}`, {
        cwd: repo
      });
      const branches = branchesRaw.split("\n");
      if (branches.length >= input.dryRunHistorySize) {
        const toDelete = branches.slice(0, branches.length - input.dryRunHistorySize);
        toDelete.forEach((branch2) => {
          const tag = branch2.replace("release/dry-run/", "");
          sh(`git push origin --delete ${branch2}`, { cwd: repo });
          sh(`git push origin --delete ${tag}`, { cwd: repo });
        });
      }
    }
    sh(`git switch --force-create ${branch}`, { cwd: repo });
    sh(`git push --force ${remote} ${branch}`, { cwd: repo });
    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core2.setFailed(error.message);
  }
}
async function cleanup(input) {
  const repo = input.repo.split("/")[1];
  core2.info(`Deleting repository ${repo}`);
  await rm(repo, { recursive: true, force: true });
}

// src/create-release-branch-main.ts
await main(setup());
