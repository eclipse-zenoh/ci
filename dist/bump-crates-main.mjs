// src/bump-crates.ts
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
    return JSON.parse(exec("toml", ["get", path, query]));
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
function packages(path) {
  const metadataContents = sh("cargo metadata --no-deps --format-version=1", { cwd: path });
  const metadata = JSON.parse(metadataContents);
  const result = [];
  for (const elem of metadata.packages) {
    result.push({
      name: elem.name,
      version: elem.version,
      manifestPath: elem.manifest_path,
      publish: elem.publish == null ? void 0 : false,
      workspaceDependencies: elem.dependencies.filter((dep) => "path" in dep).map((dep) => ({
        name: dep.name,
        req: dep.req,
        path: dep.path
      }))
    });
  }
  return result;
}
async function bump(path, version) {
  core2.startGroup(`Bumping package versions in ${path} to ${version}`);
  const manifestPath = `${path}/Cargo.toml`;
  const manifestRaw = toml.get(manifestPath);
  if ("workspace" in manifestRaw) {
    await toml.set(manifestPath, ["workspace", "package", "version"], version);
  } else {
    await toml.set(manifestPath, ["package", "version"], version);
  }
  core2.endGroup();
}
async function bumpDependencies(path, pattern, version, _branch) {
  core2.startGroup(`Bumping ${pattern} dependencies in ${path} to ${version}`);
  const manifestPath = `${path}/Cargo.toml`;
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
      await toml.set(manifestPath, prefix.concat("dependencies", dep, "version"), version);
      await toml.unset(manifestPath, prefix.concat("dependencies", dep, "git"));
      await toml.unset(manifestPath, prefix.concat("dependencies", dep, "branch"));
    }
  }
  for (const package_ of packages(path)) {
    const manifest2 = toml.get(package_.manifestPath);
    if ("metadata" in manifest2.package && "deb" in manifest2.package.metadata && "depends" in manifest2.package.metadata.deb && manifest2.package.metadata.deb.depends != "$auto" && pattern.test(manifest2.package.metadata.deb.name)) {
      const deb = manifest2.package.metadata.deb;
      const depends = deb.depends.replaceAll(/\(=[^\(\)]+\)/g, `(=${toDebianVersion(version)})`);
      core2.info(`Changing ${deb.depends} to ${depends} in ${package_.name}`);
      await toml.set(package_.manifestPath, ["package", "metadata", "deb", "depends"], depends);
    }
  }
  core2.endGroup();
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
function toDebianVersion(version, revision) {
  return `${version.replace("-", "~")}-${revision ?? 1}`;
}

// src/bump-crates.ts
function setup() {
  const version = core3.getInput("version", { required: true });
  const branch = core3.getInput("branch", { required: true });
  const repo = core3.getInput("repo", { required: true });
  const path = core3.getInput("path");
  const githubToken = core3.getInput("github-token", { required: true });
  const bumpDepsPattern = core3.getInput("bump-deps-pattern");
  const bumpDepsVersion = core3.getInput("bump-deps-version");
  const bumpDepsBranch = core3.getInput("bump-deps-branch");
  return {
    version,
    branch,
    repo,
    path: path === "" ? void 0 : path,
    githubToken,
    bumpDepsRegExp: bumpDepsPattern === "" ? void 0 : new RegExp(bumpDepsPattern),
    bumpDepsVersion: bumpDepsVersion === "" ? void 0 : bumpDepsVersion,
    bumpDepsBranch: bumpDepsBranch === "" ? void 0 : bumpDepsBranch
  };
}
async function main(input) {
  try {
    const repo = input.repo.split("/")[1];
    const workspace = input.path === void 0 ? repo : join2(repo, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    sh(`git clone --recursive --single-branch --branch ${input.branch} ${remote}`);
    sh(`ls ${workspace}`);
    await bump(workspace, input.version);
    sh("git add .", { cwd: repo });
    sh(`git commit --message 'chore: Bump version to \`${input.version}\`'`, { cwd: repo, env: gitEnv });
    if (input.bumpDepsRegExp != void 0) {
      await bumpDependencies(workspace, input.bumpDepsRegExp, input.bumpDepsVersion, input.bumpDepsBranch);
      sh("git add .", { cwd: repo });
      sh(`git commit --message 'chore: Bump ${input.bumpDepsRegExp} dependencies to \`${input.bumpDepsVersion}\`'`, {
        cwd: repo,
        env: gitEnv,
        check: false
      });
      sh("cargo check", { cwd: repo });
      sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", {
        cwd: repo,
        env: gitEnv,
        check: false
      });
    }
    sh(`git push --force ${remote} ${input.branch}`, { cwd: repo });
    sh(`git tag --force ${input.version} --message v${input.version}`, { cwd: repo, env: gitEnv });
    sh(`git push --force ${remote} ${input.version}`, { cwd: repo });
    sh("git log -10", { cwd: repo });
    sh("git show-ref --tags", { cwd: repo });
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

// src/bump-crates-main.ts
await main(setup());
