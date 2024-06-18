// src/build-crates-debian.ts
import * as fs3 from "fs/promises";
import path from "path";
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
    return JSON.parse(exec("toml", ["get", path2, query]));
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
function packages(path2) {
  const metadataContents = sh("cargo metadata --no-deps --format-version=1", { cwd: path2 });
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
function packagesDebian(path2) {
  const result = [];
  for (const package_ of packages(path2)) {
    const manifestRaw = toml.get(package_.manifestPath);
    const manifest = "workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw;
    if ("metadata" in manifest.package && "deb" in manifest.package.metadata) {
      result.push(package_);
    }
  }
  return result;
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
function buildDebian(path2, target, version) {
  for (const package_ of packagesDebian(path2)) {
    const manifest = toml.get(package_.manifestPath);
    if ("variants" in manifest.package.metadata.deb) {
      for (const variant in manifest.package.metadata.deb.variants) {
        sh(
          `cargo deb --no-build --no-strip           --target ${target}           --package ${package_.name}           --deb-version ${toDebianVersion(version)}           --variant ${variant}`,
          {
            cwd: path2
          }
        );
      }
    } else {
      sh(
        `cargo deb --no-build --no-strip         --target ${target}         --package ${package_.name}         --deb-version ${toDebianVersion(version)}`,
        {
          cwd: path2
        }
      );
    }
  }
}
function toDebianVersion(version, revision) {
  return `${version.replace("-", "~")}-${revision ?? 1}`;
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

// src/build-crates-debian.ts
var artifact = new DefaultArtifactClient();
var toml2 = await TOML.init();
function setup() {
  const repo = core3.getInput("repo", { required: true });
  const version = core3.getInput("version", { required: true });
  const branch = core3.getInput("branch", { required: true });
  const target = core3.getInput("target", { required: true });
  const githubToken = core3.getInput("github-token", { required: true });
  return {
    repo,
    version,
    branch,
    target,
    githubToken
  };
}
async function main(input) {
  try {
    await installBinaryCached("cargo-deb");
    await installBinaryCached("cross");
    const repo = input.repo.split("/")[1];
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    sh(`git clone --recursive --branch ${input.branch} --single-branch ${remote}`);
    const crossManifest = toml2.get(path.join(repo, "Cross.toml"));
    sh(`rustup target add ${input.target}`, { cwd: repo });
    if (input.target in crossManifest.target) {
      sh(`cross build --release --bins --lib --target ${input.target}`, {
        cwd: repo
      });
    } else {
      sh(`cargo build --release --bins --lib --target ${input.target}`, {
        cwd: repo
      });
    }
    const packages2 = packagesDebian(repo);
    core3.info(`Building ${packages2.map((p) => p.name).join(", ")}`);
    buildDebian(repo, input.target, input.version);
    const output = artifactName(repo, input.version, input.target);
    await fromDirectory(
      path.join(process.cwd(), output),
      path.join(repo, "target", input.target, "debian"),
      /.*deb/
    );
    const { id } = await artifact.uploadArtifact(output, [output], process.cwd());
    core3.setOutput("artifact-id", id);
    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core3.setFailed(error.message);
  }
}
function artifactName(repo, version, target) {
  return `${repo}-${version}-${target}-debian.zip`;
}
async function cleanup(input) {
  const repoPath = input.repo.split("/")[1];
  core3.info(`Deleting repository ${repoPath}`);
  await fs3.rm(repoPath, { recursive: true, force: true });
}

// src/build-crates-debian-main.ts
await main(setup());
