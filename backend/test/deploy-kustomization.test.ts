import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseAllDocuments } from "yaml";

// deploy/ relative to this test file (backend/test/ -> repo root).
const deployDir = fileURLToPath(new URL("../../deploy/", import.meta.url));
const KUSTOMIZATION = "kustomization.yaml";

type Doc = any;

function readDeploy(file: string): string {
  return readFileSync(resolve(deployDir, file), "utf8");
}

// A file's resources are its non-empty documents (a comments-only file holds none).
function resourcesOf(file: string): Doc[] {
  return parseAllDocuments(readDeploy(file))
    .map((d) => d.toJS())
    .filter((c) => c !== null && c !== undefined);
}

function yamlFiles(): string[] {
  return readdirSync(deployDir).filter((f) => f.endsWith(".yaml")).sort();
}

function isSecretFile(file: string): boolean {
  return resourcesOf(file).some((r) => r && r.kind === "Secret");
}

// Read inside the tests so an absent kustomization fails an assertion, not module load.
function kustomization(): Doc {
  expect(existsSync(resolve(deployDir, KUSTOMIZATION)), `deploy/${KUSTOMIZATION} exists`).toBe(true);
  const resources = resourcesOf(KUSTOMIZATION);
  expect(resources.length, `deploy/${KUSTOMIZATION} holds a document`).toBe(1);
  return resources[0];
}

function imageEntries(k: Doc): Doc[] {
  expect(Array.isArray(k.images), "images: is a list").toBe(true);
  return k.images;
}

describe("deploy/kustomization.yaml", () => {
  it("D05-AC-1: is a kustomize.config.k8s.io/v1beta1 Kustomization", () => {
    const k = kustomization();
    expect(k.apiVersion).toBe("kustomize.config.k8s.io/v1beta1");
    expect(k.kind).toBe("Kustomization");
  });

  it("D05-AC-1: resources lists each resource-holding file once (not itself, not Secret files), namespace.yaml first", () => {
    const k = kustomization();
    const expected = yamlFiles().filter(
      (f) => f !== KUSTOMIZATION && !isSecretFile(f) && resourcesOf(f).length > 0,
    );
    expect(Array.isArray(k.resources), "resources: is a list").toBe(true);
    expect([...k.resources].sort()).toEqual(expected);
    expect(new Set(k.resources).size).toBe(k.resources.length);
    expect(k.resources[0]).toBe("namespace.yaml");
  });

  it("D05-AC-1: lists no Secret file and has no secretGenerator", () => {
    const k = kustomization();
    const secrets = yamlFiles().filter(isSecretFile);
    expect(secrets.length).toBeGreaterThan(0);
    for (const s of secrets) expect(k.resources ?? []).not.toContain(s);
    expect(k.secretGenerator).toBeUndefined();
  });

  it("D05-AC-2: images names both images with ghcr.io/<owner>/<name> newName, one shared owner, non-empty newTag", () => {
    const entries = imageEntries(kustomization());
    const names = ["ljiljan-backend", "ljiljan-voice-agent"];
    const owners: string[] = [];
    for (const name of names) {
      const matches = entries.filter((e) => e.name === name);
      expect(matches.length, `one images entry named ${name}`).toBe(1);
      const m = /^ghcr\.io\/([a-z0-9-]+)\/([^/]+)$/.exec(String(matches[0].newName));
      expect(m, `${name} newName is ghcr.io/<owner>/${name}: ${matches[0].newName}`).not.toBeNull();
      expect(m![2]).toBe(name);
      owners.push(m![1]);
      expect(typeof matches[0].newTag).toBe("string");
      expect(matches[0].newTag.length).toBeGreaterThan(0);
    }
    expect(owners[0]).toBe(owners[1]);
  });

  it("D05-AC-2: every workload container and init container image is a bare images entry name", () => {
    const k = kustomization();
    const imageNames = imageEntries(k).map((e) => e.name);
    const listed: string[] = k.resources ?? [];
    expect(listed.length).toBeGreaterThan(0);
    const workloads: Doc[] = [];
    for (const file of listed) {
      for (const r of resourcesOf(file)) {
        if (r && (r.kind === "Deployment" || r.kind === "Job")) workloads.push(r);
      }
    }
    expect(workloads.length, "backend Deployment, seed Job, voice-agent Deployment").toBe(3);
    for (const w of workloads) {
      const spec = w.spec?.template?.spec ?? {};
      const containers = [...(spec.containers ?? []), ...(spec.initContainers ?? [])];
      expect(containers.length, `${w.kind}/${w.metadata?.name} has containers`).toBeGreaterThan(0);
      for (const c of containers) {
        const image = String(c.image);
        expect(image, `${w.metadata?.name}/${c.name} image has no registry or tag`).not.toMatch(/[/:@]/);
        expect(imageNames, `${w.metadata?.name}/${c.name} image ${image} is named in images:`).toContain(image);
      }
    }
  });

  it("D05-AC-3: no file in deploy/ contains OWNER, and only the kustomization and Secret files contain ghcr.io/", () => {
    const files = readdirSync(deployDir).sort();
    const offendersOwner = files.filter((f) => readDeploy(f).includes("OWNER"));
    expect(offendersOwner, "files containing OWNER").toEqual([]);
    const offendersRegistry = files.filter(
      (f) =>
        f !== KUSTOMIZATION &&
        !(f.endsWith(".yaml") && isSecretFile(f)) &&
        readDeploy(f).includes("ghcr.io/"),
    );
    expect(offendersRegistry, "files other than the kustomization and Secret files containing ghcr.io/").toEqual([]);
  });
});
