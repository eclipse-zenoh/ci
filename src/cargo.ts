import * as fs from "fs/promises";
import { platform, arch, homedir } from "os";
import { join } from "path";

import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as toml from "smol-toml";

import { sh } from "./command";
import { config } from "./config";

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
  const metadataContents = sh("cargo metadata --no-deps --format-version '1'", { cwd: path });
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
    deb?: {
      name: string;
      depends?: string;
    };
  };
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
  const manifestRaw = await loadTOML(manifestPath);
  const manifest = ("workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw) as CargoManifest;

  if (typeof manifest.package.version == "string") {
    manifest.package.version = version;

    await dumpTOML(manifestPath, manifestRaw);
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
export async function bumpDependencies(path: string, pattern: RegExp, version: string, branch?: string) {
  core.startGroup(`Bumping ${pattern} dependencies in ${path} to ${version}`);
  const manifestPath = `${path}/Cargo.toml`;
  const manifestRaw = await loadTOML(manifestPath);
  const manifest = ("workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw) as CargoManifest;

  let changed = false;
  for (const dep in manifest.dependencies) {
    if (pattern.test(dep)) {
      const table = manifest.dependencies[dep] as CargoManifestDependencyTable;
      table.version = version;
      if (branch != undefined) {
        table.branch = branch;
      }
      changed = true;
    }
  }

  if (changed) {
    await dumpTOML(manifestPath, manifestRaw);
  }

  for (const package_ of packages(path)) {
    const manifestRaw = await loadTOML(package_.manifestPath);
    const manifest = ("workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw) as CargoManifest;

    if (
      "metadata" in manifest.package &&
        "deb" in manifest.package.metadata &&
        "depends" in manifest.package.metadata.deb &&
        manifest.package.metadata.deb.depends != "$auto" &&
        pattern.test(manifest.package.metadata.deb.name)
    ) {
      const deb = manifest.package.metadata.deb;
      const depends = deb.depends.replaceAll(/\(=[^\(\)]+\)/g, `(=${version})`);
      core.info(`Changing ${deb.depends} to ${depends} in ${package_.name}`);
      deb.depends = depends;

      await dumpTOML(package_.manifestPath, manifestRaw);
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
  const manifestRaw = await loadTOML(manifestPath);
  const manifest = ("workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw) as CargoManifest;

  let changed = false;
  for (const dep in manifest.dependencies) {
    if (pattern.test(dep)) {
      const table = manifest.dependencies[dep] as CargoManifestDependencyTable;
      table.registry = registry;
      changed = true;
    }
  }

  if (changed) {
    await dumpTOML(manifestPath, manifestRaw);
  }
  core.endGroup();
}

/**
 * Stores Cargo registry configuration in `.cargo/config.toml`.
 * @param path Path to the Cargo workspace.
 * @param name Name of the Cargo alternative registry.
 * @param index Index of the Cargo alternative registry.
 */
export async function configRegistry(path: string, name: string, index: string) {
  const configPath = `${path}/.cargo/config.toml`;
  const configRaw = await loadTOML(configPath);
  const config = configRaw;
  config.registries = {
    [name]: {
      index,
    },
  };
  await dumpTOML(configPath, config);
}

/**
 * Returns a list of all workspace packages which contain Debian package metadata.
 * @param path Path to the Cargo workspace.
 */
export async function packagesDebian(path: string): Promise<Package[]> {
  const result = [] as Package[];

  for (const package_ of packages(path)) {
    const manifestRaw = await loadTOML(package_.manifestPath);

    const manifest = ("workspace" in manifestRaw ? manifestRaw["workspace"] : manifestRaw) as CargoManifest;

    if ("metadata" in manifest.package && "deb" in manifest.package.metadata) {
      result.push(package_);
    }
  }

  return result;
}

/**
 * Installs a cargo binary by compiling it from source using `cargo install`.
 * The executable is cached using GitHub's `@actions/cache`.
 * @param name Name of the cargo binary on crates.io
 */
export async function installBinaryCached(name: string) {
  if (process.env["GITHUB_ACTIONS"] != undefined) {
    const paths = [join(homedir(), ".cargo", "bin")];
    const version = config.lock.cratesio[name];
    const key = `${platform()}-${arch()}-${name}-${version}`;

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

async function loadTOML(path: string): Promise<Record<string, toml.TomlPrimitive>> {
  const contents = await fs.readFile(path, "utf-8");
  return toml.parse(contents);
}

async function dumpTOML(path: string, obj: Record<string, toml.TomlPrimitive>) {
  await fs.writeFile(path, toml.stringify(obj));
}
