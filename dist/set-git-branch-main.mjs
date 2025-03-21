// src/set-git-branch.ts
import { join as join2 } from "path";
import { rm } from "fs/promises";
import * as core3 from "@actions/core";

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
function exec(program, args, options) {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";
  core.startGroup(`\x1B[1m\x1B[35m${program}(${args.join(", ")})\x1B[0m`);
  const returns = spawnSync(program, args, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring is order is
    // important
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "pipe",
    shell: false,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER
  });
  if (returns.stdout != "") {
    core.info(`\x1B[1mstdout:\x1B[0m`);
    core.info(returns.stdout);
  }
  if (returns.stderr != "") {
    core.info(`\x1B[1mstderr:\x1B[0m`);
    core.info(returns.stderr);
  }
  core.endGroup();
  if (options.check && returns.status != 0) {
    throw new Error(`\`${program}(${args.join(", ")})\` failed with status code ${returns.status}:
${returns.stderr}`);
  }
  return returns.stdout;
}

// src/cargo.ts
import * as os from "os";
import { join } from "path";
import * as core2 from "@actions/core";
import * as cache from "@actions/cache";

// src/toml.ts
import * as fs from "fs/promises";
var TOML = class _TOML {
  static async init() {
    await installBinaryCached("toml-cli2");
    return new _TOML();
  }
  get(path, key) {
    const query = key == void 0 ? "." : key.join(".");
    const out = exec("toml", ["get", path, query], { check: false });
    if (out) {
      return JSON.parse(out);
    } else {
      return void 0;
    }
  }
  async set(path, key, value) {
    const query = key.join(".");
    await fs.writeFile(path, exec("toml", ["set", path, query, value]));
  }
  async unset(path, key) {
    const query = key.join(".");
    await fs.writeFile(path, exec("toml", ["unset", path, query]));
  }
};

// ci.config.json
var ci_config_default = {
  git: {
    user: {
      name: "eclipse-zenoh-bot",
      email: "eclipse-zenoh-bot@users.noreply.github.com"
    }
  },
  lock: {
    cratesio: {
      "cargo-deb": "2.1.0",
      estuary: "0.1.1",
      cross: "0.2.5",
      "toml-cli2": "0.3.2"
    },
    git: {
      estuary: {
        url: "https://github.com/ZettaScaleLabs/estuary.git",
        branch: "main"
      }
    }
  }
};

// src/config.ts
var config = ci_config_default;
var gitEnv = {
  GIT_AUTHOR_NAME: config.git.user.name,
  GIT_AUTHOR_EMAIL: config.git.user.email,
  GIT_COMMITTER_NAME: config.git.user.name,
  GIT_COMMITTER_EMAIL: config.git.user.email
};

// src/cargo.ts
var toml = await TOML.init();
async function setGitBranch(manifestPath, pattern, gitUrl, gitBranch) {
  core2.startGroup(`Setting ${pattern} dependencies' git/branch config`);
  const manifestRaw = toml.get(manifestPath);
  let manifest;
  let prefix;
  if ("workspace" in manifestRaw) {
    prefix = ["workspace"];
    manifest = manifestRaw["workspace"];
  } else {
    prefix = [];
    manifest = manifestRaw;
  }
  for (const dep in manifest.dependencies) {
    if (pattern.test(dep)) {
      if (!(toml.get(manifestPath, prefix.concat("dependencies", dep, "path")) || toml.get(manifestPath, prefix.concat("dependencies", dep, "workspace")))) {
        await toml.set(manifestPath, prefix.concat("dependencies", dep, "git"), gitUrl);
        await toml.set(manifestPath, prefix.concat("dependencies", dep, "branch"), gitBranch);
      }
    }
  }
}
async function installBinaryCached(name) {
  if (process.env["GITHUB_ACTIONS"] != void 0) {
    const paths = [join(os.homedir(), ".cargo", "bin")];
    const version = config.lock.cratesio[name];
    const key = `${os.platform()}-${os.release()}-${os.arch()}-${name}-${version}`;
    const hit = await cache.restoreCache(paths, key);
    if (hit == void 0) {
      sh(`cargo +stable install ${name} --force`);
      await cache.saveCache(paths, key);
    }
  } else {
    sh(`cargo +stable install ${name}`);
  }
}

// src/set-git-branch.ts
function setup() {
  const version = core3.getInput("version", { required: true });
  const releaseBranch = core3.getInput("release-branch", { required: true });
  const repo = core3.getInput("repo", { required: true });
  const path = core3.getInput("path");
  const githubToken = core3.getInput("github-token", { required: true });
  const depsPattern = core3.getInput("deps-pattern");
  const depsGitUrl = core3.getInput("deps-git-url");
  const depsBranch = core3.getInput("deps-branch");
  return {
    version,
    releaseBranch,
    repo,
    path: path === "" ? void 0 : path,
    githubToken,
    depsRegExp: depsPattern === "" ? void 0 : new RegExp(depsPattern),
    depsGitUrl: depsGitUrl === "" ? void 0 : depsGitUrl,
    depsBranch: depsBranch === "" ? void 0 : depsBranch
  };
}
async function main(input) {
  try {
    const repo = input.repo.split("/")[1];
    const workspace = input.path === void 0 ? repo : join2(repo, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    sh(`git clone --recursive --single-branch --branch ${input.releaseBranch} ${remote}`);
    sh(`git switch -c eclipse-zenoh-bot/post-release-${input.version}`, { cwd: repo });
    sh(`ls ${workspace}`);
    const cargoPaths = sh(`find ${workspace} -name "Cargo.toml*"`).split("\n").filter((r) => r);
    for (const path of cargoPaths) {
      await setGitBranch(path, input.depsRegExp, input.depsGitUrl, input.depsBranch);
      if (sh("git diff", { cwd: repo, check: false })) {
        sh("find . -name 'Cargo.toml*' | xargs git add", { cwd: repo });
        sh(`git commit --message 'chore: Update git/branch ${path}'`, { cwd: repo, env: gitEnv });
        if (path.endsWith("Cargo.toml")) {
          sh(`cargo check --manifest-path ${path}`);
          sh("find . -name 'Cargo.lock' | xargs git add", { cwd: repo });
          sh("git commit --message 'chore: Update Cargo lockfile'", {
            cwd: repo,
            env: gitEnv,
            check: false
          });
        }
      }
    }
    sh(`git push --force ${remote} eclipse-zenoh-bot/post-release-${input.version}`, { cwd: repo });
    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core3.setFailed(error.message);
  }
}
async function cleanup(input) {
  const repo = input.repo.split("/")[1];
  core3.info(`Deleting repository clone ${repo}`);
  await rm(repo, { recursive: true, force: true });
}

// src/set-git-branch-main.ts
await main(setup());
