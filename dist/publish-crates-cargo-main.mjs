// src/publish-crates-cargo.ts
import { rm } from "fs/promises";
import * as core3 from "@actions/core";

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
function* packagesOrdered(path) {
  const allPackages = packages(path);
  const seen = [];
  const isReady = (package_) => package_.workspaceDependencies.every((dep) => seen.includes(dep.name));
  while (allPackages.length != 0) {
    for (const [index, package_] of allPackages.entries()) {
      if (isReady(package_)) {
        seen.push(package_.name);
        allPackages.splice(index, 1);
        yield package_;
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
function isPublished(pkg, options) {
  const optionsCopy = Object.assign({}, options);
  optionsCopy.check = false;
  const results = sh(`cargo search ${pkg.name}`, optionsCopy);
  if (!results || results.startsWith("error:")) {
    return false;
  }
  const publishedVersion = results.split("\n").at(0).match(/".*"/g).at(0).slice(1, -1);
  return publishedVersion === pkg.version;
}

// src/publish-crates-cargo.ts
function setup() {
  const liveRun = core3.getBooleanInput("live-run", { required: true });
  const branch = core3.getInput("branch", { required: true });
  const repo = core3.getInput("repo", { required: true });
  const githubToken = core3.getInput("github-token", { required: true });
  const cratesIoToken = core3.getInput("crates-io-token", { required: true });
  const unpublishedDepsPatterns = core3.getInput("unpublished-deps-patterns");
  const unpublishedDepsRepos = core3.getInput("unpublished-deps-repos");
  const publicationTest = core3.getBooleanInput("publication-test");
  return {
    liveRun,
    branch,
    repo,
    githubToken,
    unpublishedDepsRegExp: unpublishedDepsPatterns === "" ? /^$/ : new RegExp(unpublishedDepsPatterns.split("\n").join("|")),
    unpublishedDepsRepos: unpublishedDepsRepos === "" ? [] : unpublishedDepsRepos.split("\n"),
    cratesIoToken,
    publicationTest
  };
}
async function main(input) {
  try {
    if (input.publicationTest) {
      core3.info("Running cargo check before publication");
      clone(input, input.repo, input.branch);
      const path = repoPath(input.repo);
      const options = {
        cwd: path,
        check: true
      };
      for (const package_ of packagesOrdered(path)) {
        const command = ["cargo", "check", "-p", package_.name, "--manifest-path", package_.manifestPath];
        sh(command.join(" "), options);
      }
      await deleteRepos(input);
    }
    if (input.liveRun) {
      for (const repo of input.unpublishedDepsRepos) {
        publishToCratesIo(input, repo);
      }
      publishToCratesIo(input, input.repo, input.branch);
    }
  } catch (error) {
    if (error instanceof Error) core3.setFailed(error.message);
  }
}
function clone(input, repo, branch) {
  const remote = `https://${input.githubToken}@github.com/${repo}.git`;
  if (branch === void 0) {
    sh(`git clone --recursive ${remote}`);
  } else {
    sh(`git clone --recursive --single-branch --branch ${branch} ${remote}`);
  }
}
async function deleteRepos(input) {
  core3.info(`Deleting repository clone ${repoPath(input.repo)}`);
  await rm(repoPath(input.repo), { recursive: true, force: true });
  for (const repo of input.unpublishedDepsRepos) {
    core3.info(`Deleting repository clone ${repoPath(repo)}`);
    await rm(repoPath(repo), { recursive: true, force: true });
  }
}
function repoPath(repo) {
  return repo.split("/").at(1);
}
function publishToCratesIo(input, repo, branch) {
  clone(input, repo, branch);
  const path = repoPath(repo);
  const env = {
    CARGO_REGISTRY_TOKEN: input.cratesIoToken
  };
  publish(path, env);
}
function publish(path, env, allowDirty = false) {
  const options = {
    env,
    cwd: path,
    check: true
  };
  for (const package_ of packagesOrdered(path)) {
    if (!isPublished(package_, options) && (package_.publish === void 0 || package_.publish)) {
      const command = ["cargo", "publish", "--locked", "--manifest-path", package_.manifestPath];
      if (allowDirty) {
        command.push("--allow-dirty");
      }
      sh(command.join(" "), options);
    }
  }
  sh("cargo clean", options);
}

// src/publish-crates-cargo-main.ts
await main(setup());
