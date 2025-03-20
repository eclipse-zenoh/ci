// src/build-crates-standalone.ts
import * as path from "path";
import * as core3 from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

// src/cargo.ts
import * as os from "os";
import { join } from "path";
import * as core2 from "@actions/core";
import * as cache from "@actions/cache";

// src/toml.ts
import * as fs from "fs/promises";

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

// src/toml.ts
var TOML = class _TOML {
  static async init() {
    await installBinaryCached("toml-cli2");
    return new _TOML();
  }
  get(path2, key) {
    const query = key == void 0 ? "." : key.join(".");
    const out = exec("toml", ["get", path2, query], { check: false });
    if (out) {
      return JSON.parse(out);
    } else {
      return void 0;
    }
  }
  async set(path2, key, value) {
    const query = key.join(".");
    await fs.writeFile(path2, exec("toml", ["set", path2, query, value]));
  }
  async unset(path2, key) {
    const query = key.join(".");
    await fs.writeFile(path2, exec("toml", ["unset", path2, query]));
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
function build(path2, target) {
  const crossManifest = toml.get(join(path2, "Cross.toml"));
  sh(`rustup target add ${target}`, { cwd: path2 });
  const command = target in crossManifest.target ? ["cross"] : ["cargo"];
  command.push("build", "--release", "--bins", "--lib", "--target", target);
  sh(command.join(" "), { cwd: path2 });
}
function hostTarget() {
  return sh("rustc --version --verbose").match(/host: (?<target>.*)/).groups["target"];
}

// src/zip.ts
import * as fs2 from "fs/promises";
import * as os2 from "os";
async function fromDirectory(output, dir, pattern) {
  const dirents = await fs2.readdir(dir, { withFileTypes: true });
  const files = dirents.filter((d) => pattern.test(d.name)).map((d) => d.name);
  if (files.length === 0) {
    throw new Error("Attempt to create empty ZIP archive");
  }
  const platform3 = os2.platform();
  if (platform3 == "linux" || platform3 == "darwin") {
    sh(`zip --verbose --recurse-paths ${output} ${files.join(" ")}`, { cwd: dir });
  } else if (os2.platform() == "win32") {
    sh(`7z -y -r a ${output} ${files.join(" ")}`, { cwd: dir });
  }
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
function describe(path2 = process.cwd()) {
  return sh("git describe", { cwd: path2 }).trim();
}

// src/build-crates-standalone.ts
var artifact = new DefaultArtifactClient();
function setup() {
  const repo = core3.getInput("repo", { required: true });
  const version = core3.getInput("version");
  const branch = core3.getInput("branch");
  const target = core3.getInput("target");
  const artifactPatterns = core3.getInput("artifact-patterns", { required: true });
  const githubToken = core3.getInput("github-token");
  return {
    repo,
    version: version == "" ? void 0 : version,
    branch: branch == "" ? void 0 : branch,
    target: target == "" ? void 0 : target,
    artifactRegExp: new RegExp(artifactPatterns.split("\n").join("|")),
    githubToken: githubToken == "" ? void 0 : githubToken
  };
}
async function main(input) {
  try {
    await installBinaryCached("cross");
    const repoName = input.repo.split("/").at(1);
    const repoPath = process.env["GITHUB_ACTIONS"] != void 0 ? process.cwd() : repoName;
    cloneFromGitHub(input.repo, {
      branch: input.branch,
      token: input.githubToken,
      path: repoPath
    });
    input.version ??= describe(repoPath);
    input.target ??= hostTarget();
    build(repoPath, input.target);
    const output = artifactName(repoName, input.version, input.target);
    await fromDirectory(
      path.join(process.cwd(), output),
      path.join(repoPath, "target", input.target, "release"),
      input.artifactRegExp
    );
    const { id } = await artifact.uploadArtifact(output, [output], process.cwd());
    core3.setOutput("artifact-id", id);
    core3.setOutput("artifact-name", output);
  } catch (error) {
    if (error instanceof Error) core3.setFailed(error.message);
  }
}
function artifactName(repo, version, target) {
  return `${repo}-${version}-${target}-standalone.zip`;
}

// src/build-crates-standalone-main.ts
await main(setup());
