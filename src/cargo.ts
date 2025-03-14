import * as os from "os";
import { join } from "path";

import * as core from "@actions/core";
import * as cache from "@actions/cache";

import { TOML } from "./toml";
import { sh, CommandOptions } from "./command";
import { config } from "./config";
import * as cargo from "./cargo";

const toml = await TOML.init();

export type Package = {
  name: string;
  version: string;
  manifestPath: string;
  publish?: false;
  workspaceDependencies: WorkspaceDependency[];
};

export type WorkspaceDependency = {
  name: string;
  req: string;
  path: string;
};

type CargoMetadataDependency = {
  name: string;
  req: string;
  path?: string;
  [key: string]: unknown;
};

type CargoMetadataPackage = {
  name: string;
  version: string;
  manifest_path: string;
  dependencies: CargoMetadataDependency[];
  publish: string[] | null;
  [key: string]: unknown;
};

type CargoMetadata = {
  packages: CargoMetadataPackage[];
};

/**
 * Uses the cargo-metadata command to list all packages in a Cargo workspace or crate.
 * @param path Path to the Cargo workspace or crate.
 * @returns The list of Cargo packages present in the workspace or crate.
 */
export function packages(path: string): Package[] {
  const metadataContents = sh("cargo metadata --no-deps --format-version=1", { cwd: path });
  const metadata = JSON.parse(metadataContents) as CargoMetadata;

  const result = [] as Package[];
  for (const elem of metadata.packages) {
    result.push({
      name: elem.name,
      version: elem.version,
      manifestPath: elem.manifest_path,
      publish: elem.publish == null ? undefined : false,
      workspaceDependencies: elem.dependencies
        .filter(dep => "path" in dep)
        .map(dep => ({
          name: dep.name,
          req: dep.req,
          path: dep.path,
        })),
    });
  }

  return result;
}

/**
 * Yields packages in topological (suitable for publishing) order in a workspace.
 * @param path Path to the Cargo workspace.
 */
export function* packagesOrdered(path: string): Generator<Package> {
  const allPackages = packages(path);
  const seen = [];

  const isReady = (package_: Package) => package_.workspaceDependencies.every(dep => seen.includes(dep.name));

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

type CargoManifestPackage = {
  version: string | { workspace: boolean };
  metadata?: {
    deb?: CargoManifestMetadataDebianVariant | { variants: { [key: string]: CargoManifestMetadataDebianVariant } };
  };
};

type CargoManifestMetadataDebianVariant = {
  name: string;
  depends?: string;
};

type CargoManifestDependencyTable = {
  version: string;
  git?: string;
  branch?: string;
  registry?: string;
};

type CargoManifestDependencies = {
  [key: string]: string | CargoManifestDependencyTable;
};

type CargoManifest = {
  package: CargoManifestPackage;
  dependencies: CargoManifestDependencies;
};

/**
 * Bump this workspaces's version to @param version.
 *
 * This function assumes that the workspace's root manifest is either (1) a
 * virtual manifest from which all workspace members inherit their version (e.g.
 * eclipse-zenoh/zenoh and eclipse-zenoh/zenoh-plugin-influxdb), or (2) a
 * manifest without a workspace section with only one member (e.g.
 * eclipse-zenoh/zenoh-plugin-webserver).
 *
 * @param path Path to the Cargo workspace.
 * @param version New version.
 */
export async function bump(path: string, version: string) {
  core.startGroup(`Bumping package versions in ${path} to ${version}`);
  const manifestPath = `${path}/Cargo.toml`;
  const manifestRaw = toml.get(manifestPath);

  if ("workspace" in manifestRaw) {
    await toml.set(manifestPath, ["workspace", "package", "version"], version);
  } else {
    await toml.set(manifestPath, ["package", "version"], version);
  }

  core.endGroup();
}

/**
 * Bumps select workspace dependencies to @param version.
 *
 * This function assumes that the workspace's root manifest is either (1) a
 * virtual manifest from which all workspace members inherit their dependencies
 * (e.g. eclipse-zenoh/zenoh and eclipse-zenoh/zenoh-plugin-influxdb), or (2) a
 * manifest without a workspace section with only one member (e.g.
 * eclipse-zenoh/zenoh-plugin-webserver). It also assumes that all matching
 * dependencies define a version, a git repository remote and a git branch.
 *
 * @param path Path to the Cargo workspace.
 * @param pattern A regular expression that matches the dependencies to be
 * @param version New version.
 * @param git Git repository location.
 * @param branch Branch of git repository location. bumped to @param version.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function bumpDependencies(path: string, pattern: RegExp, version: string, _branch?: string) {
  core.startGroup(`Bumping ${pattern} dependencies in ${path} to ${version}`);
  const manifestPath = `${path}/Cargo.toml`;
  const manifestRaw = toml.get(manifestPath);

  let manifest: CargoManifest;
  let prefix: string[];
  if ("workspace" in manifestRaw) {
    prefix = ["workspace"];
    manifest = manifestRaw["workspace"] as CargoManifest;
  } else {
    prefix = [];
    manifest = manifestRaw as CargoManifest;
  }

  for (const dep in manifest.dependencies) {
    if (pattern.test(dep)) {
      await toml.set(manifestPath, prefix.concat("dependencies", dep, "version"), version);

      // FIXME(fuzzypixelz): Previously, we set the branch of the git source in dependencies,
      // but as all dependencies are assumed to be on crates.io anyway, this is not necessary.
      // Still, the API of all related actions/workflows should be updated to reflect this.
      //
      // if (branch != undefined) {
      //   await toml.set(manifestPath, prefix.concat("dependencies", dep, "branch"), branch);
      // }
      await toml.unset(manifestPath, prefix.concat("dependencies", dep, "git"));
      await toml.unset(manifestPath, prefix.concat("dependencies", dep, "branch"));
    }
  }

  for (const package_ of packages(path)) {
    const manifest = toml.get(package_.manifestPath) as CargoManifest;

    if (
      "metadata" in manifest.package &&
      "deb" in manifest.package.metadata &&
      "depends" in manifest.package.metadata.deb &&
      manifest.package.metadata.deb.depends != "$auto" &&
      pattern.test(manifest.package.metadata.deb.name)
    ) {
      const deb = manifest.package.metadata.deb;
      const depends = deb.depends.replaceAll(/\(=[^\(\)]+\)/g, `(=${cargo.toDebianVersion(version)})`);
      core.info(`Changing ${deb.depends} to ${depends} in ${package_.name}`);
      await toml.set(package_.manifestPath, ["package", "metadata", "deb", "depends"], depends);
    }
  }

  core.endGroup();
}

/**
 * Sets the Cargo registry of select dependencies.
 *
 * @param path Path to the Cargo workspace.
 * @param pattern A regular expression that matches the dependencies to be
 * switched to using @param registry.
 * @param registry The name of the Cargo alternative registry.
 */
export async function setRegistry(path: string, pattern: RegExp, registry: string): Promise<void> {
  core.startGroup(`Changing ${pattern} dependencies' registry ${registry}`);
  const manifestPath = `${path}/Cargo.toml`;
  const manifestRaw = toml.get(manifestPath);

  let manifest: CargoManifest;
  let prefix: string[];
  if ("workspace" in manifestRaw) {
    prefix = ["workspace"];
    manifest = manifestRaw["workspace"] as CargoManifest;
  } else {
    prefix = [];
    manifest = manifestRaw as CargoManifest;
  }

  for (const dep in manifest.dependencies) {
    if (pattern.test(dep)) {
      await toml.set(manifestPath, prefix.concat("dependencies", dep, "registry"), registry);
      // NOTE: Only one of `git` or `registry` is allowed, otherwise the specification is ambiguous
      await toml.unset(manifestPath, prefix.concat("dependencies", dep, "git"));
      await toml.unset(manifestPath, prefix.concat("dependencies", dep, "branch"));
    }
  }

  core.endGroup();
}

/**
 * Sets the git/branch config of select dependencies.
 *
 * @param manifestPath Path to the Cargo.toml file.
 * @param pattern A regular expression that matches the dependencies to be
 * @param gitUrl git url to set in Cargo.toml dependency
 * @param gitBranch git branch to set in Cargo.toml dependency
 * updated
 */
export async function setGitBranch(
  manifestPath: string,
  pattern: RegExp,
  gitUrl: string,
  gitBranch: string,
): Promise<void> {
  core.startGroup(`Setting ${pattern} dependencies' git/branch config`);
  const manifestRaw = toml.get(manifestPath);

  let manifest: CargoManifest;
  let prefix: string[];
  if ("workspace" in manifestRaw) {
    prefix = ["workspace"];
    manifest = manifestRaw["workspace"] as CargoManifest;
  } else {
    prefix = [];
    manifest = manifestRaw as CargoManifest;
  }

  for (const dep in manifest.dependencies) {
    if (pattern.test(dep)) {
      // if the dep has a path set or is part of workspace, don't set the git/branch to avoid ambiguities
      if (
        !(
          toml.get(manifestPath, prefix.concat("dependencies", dep, "path")) ||
          toml.get(manifestPath, prefix.concat("dependencies", dep, "workspace"))
        )
      ) {
        await toml.set(manifestPath, prefix.concat("dependencies", dep, "git"), gitUrl);
        await toml.set(manifestPath, prefix.concat("dependencies", dep, "branch"), gitBranch);
      }
    }
  }
}

/**
 * Stores Cargo registry configuration in `.cargo/config.toml`.
 * @param path Path to the Cargo workspace.
 * @param name Name of the Cargo alternative registry.
 * @param index Index of the Cargo alternative registry.
 */
export async function configRegistry(path: string, name: string, index: string) {
  const configPath = `${path}/.cargo/config.toml`;
  await toml.set(configPath, ["registries", name, "index"], index);
}

/**
 * Returns a list of all workspace packages which contain Debian package metadata.
 * @param path Path to the Cargo workspace.
 */
export function packagesDebian(path: string): Package[] {
  const result = [] as Package[];

  for (const package_ of packages(path)) {
    const manifestRaw = toml.get(package_.manifestPath);
    const manifest = ("workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw) as CargoManifest;

    if ("metadata" in manifest.package && "deb" in manifest.package.metadata) {
      result.push(package_);
    }
  }

  return result;
}

export function installBinaryFromGit(name: string, gitUrl: string, gitBranch: string) {
  sh(`cargo +stable install --git ${gitUrl} --branch ${gitBranch} ${name} --locked`);
}

/**
 * Installs a cargo binary by compiling it from source using `cargo install`.
 * The executable is cached using GitHub's `@actions/cache`.
 * @param name Name of the cargo binary on crates.io
 */
export async function installBinaryCached(name: string) {
  if (process.env["GITHUB_ACTIONS"] != undefined) {
    const paths = [join(os.homedir(), ".cargo", "bin")];
    const version = config.lock.cratesio[name];
    const key = `${os.platform()}-${os.release()}-${os.arch()}-${name}-${version}`;

    // NOTE: We specify the Stable toolchain to override the current Rust
    // toolchain file in the current directory, as the caller can use this
    // function with an arbitrary Rust toolchain, often resulting in build
    // failure

    const hit = await cache.restoreCache(paths, key);
    if (hit == undefined) {
      sh(`cargo +stable install ${name} --force`);
      await cache.saveCache(paths, key);
    }
  } else {
    sh(`cargo +stable install ${name}`);
  }
}

type CrossManifest = {
  target: { [target: string]: { image: string } };
};

export function build(path: string, target: string) {
  const crossManifest = toml.get(join(path, "Cross.toml")) as CrossManifest;

  sh(`rustup target add ${target}`, { cwd: path });

  const command = target in crossManifest.target ? ["cross"] : ["cargo"];
  command.push("build", "--release", "--bins", "--lib", "--target", target);
  sh(command.join(" "), { cwd: path });
}

export function hostTarget(): string {
  return sh("rustc --version --verbose").match(/host: (?<target>.*)/).groups["target"];
}

export function buildDebian(path: string, target: string, version: string) {
  for (const package_ of packagesDebian(path)) {
    const manifest = toml.get(package_.manifestPath) as CargoManifest;

    if ("variants" in manifest.package.metadata.deb) {
      for (const variant in manifest.package.metadata.deb.variants) {
        sh(
          `cargo deb --no-build --no-strip \
          --target ${target} \
          --package ${package_.name} \
          --deb-version ${cargo.toDebianVersion(version)} \
          --variant ${variant}`,
          {
            cwd: path,
          },
        );
      }
    } else {
      sh(
        `cargo deb --no-build --no-strip \
        --target ${target} \
        --package ${package_.name} \
        --deb-version ${cargo.toDebianVersion(version)}`,
        {
          cwd: path,
        },
      );
    }
  }
}

/**
 * Transforms a version number to a version number that conforms to the Debian Policy.
 * @param version Version number.
 * @param revision Package revision number.
 * @returns Modified version.
 */
export function toDebianVersion(version: string, revision?: number): string {
  let debVersion = version;
  // Check if version is semver or cmake version
  if (version.includes("-")) {
    // HACK(fuzzypixelz): This is an oversimplification of the Debian Policy
    debVersion = `${version.replace("-", "~")}-${revision ?? 1}`;
  } else {
    // check cmake version has tweak component
    if (version.split(".").length == 4) {
      if (version.endsWith(".0")) {
        const pos = version.lastIndexOf(".0");
        debVersion = `${version.substring(0, pos)}~dev-${revision ?? 1}`;
      } else if (parseInt(version.substring(version.lastIndexOf(".") + 1)) > 0) {
        const pos = version.lastIndexOf(".");
        debVersion = `${version.substring(0, pos)}~pre.${version.substring(pos + 1)}-${revision ?? 1}`;
      }
    }
  }
  return `${debVersion}`;
}

/**
 * Check if Package is already published
 * @param pkg Package to check.
 */
export function isPublished(pkg: Package, options?: CommandOptions): boolean {
  const optionsCopy: CommandOptions = Object.assign({}, options);
  optionsCopy.check = false;
  // Hackish but registries don't have a stable api anyway.
  const results = sh(`cargo search ${pkg.name}`, optionsCopy);
  if (!results || results.startsWith("error:")) {
    return false;
  }
  const publishedVersion = results.split("\n").at(0).match(/".*"/g).at(0).slice(1, -1);
  return publishedVersion === pkg.version;
}
