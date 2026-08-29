"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db, hasFirebaseConfig } from "@/lib/firebase";

export type AllocationMode = "hours" | "percent";
export type ContributionProjectStatus = "one_off" | "ongoing" | "complete";
export type ContributionStepStatus = "planning" | "in_progress" | "done";
export type ContributionStepDisplayStatus = ContributionStepStatus | "blocked";

export type ProjectStepDependency =
  | { kind: "project"; projectId: string }
  | { kind: "step"; projectId: string; stepId: string };

export interface ProjectContributor {
  id: string;
  name: string;
}

export interface ContributionStep {
  id: string;
  title: string;
  status: ContributionStepStatus;
  dependency: ProjectStepDependency | null;
  weightValue: number;
  contributorMode: AllocationMode;
  contributorValues: Record<string, number>;
}

export interface ContributionProject {
  id: string;
  title: string;
  status: ContributionProjectStatus;
  tags: string[];
  contributors: ProjectContributor[];
  weightMode: AllocationMode;
  projectHours: number | null;
  steps: ContributionStep[];
  createdAt: number;
  updatedAt: number;
}

export interface ContributorRollup {
  contributor: ProjectContributor;
  fraction: number;
  hours: number | null;
}

export interface ProjectRollup {
  contributorRollups: ContributorRollup[];
  totalFraction: number;
  totalHours: number | null;
}

export interface StepDependencyResolution {
  label: string;
  blocked: boolean;
  missing: boolean;
}

const DEMO_STORE_KEY = "swell-parts:contribution-projects:v1";
export const MAX_PROJECT_TAGS = 12;
export const MAX_PROJECT_TAG_LENGTH = 32;

const DEFAULT_CONTRIBUTORS: ProjectContributor[] = [
  { id: "ike", name: "Ike" },
  { id: "cron", name: "Cron" },
  { id: "josh", name: "Josh" },
];

function finiteNonNegative(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function timestampMillis(value: unknown, fallback = Date.now()) {
  if (
    value
    && typeof value === "object"
    && "toMillis" in value
    && typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function valuesFromData(value: unknown, contributorIds: string[]) {
  const data = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    contributorIds.map((contributorId) => [
      contributorId,
      finiteNonNegative(data[contributorId]),
    ]),
  );
}

function contributorsFromData(value: unknown) {
  if (!Array.isArray(value)) return structuredClone(DEFAULT_CONTRIBUTORS);
  const contributors = value.flatMap((item, index): ProjectContributor[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) return [];
    const id = typeof data.id === "string" && data.id.trim()
      ? data.id.trim()
      : `contributor-${index + 1}`;
    return [{ id, name }];
  });
  return contributors.length ? contributors : structuredClone(DEFAULT_CONTRIBUTORS);
}

function dependencyFromData(value: unknown): ProjectStepDependency | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.kind === "project" && typeof data.projectId === "string" && data.projectId) {
    return { kind: "project", projectId: data.projectId };
  }
  if (
    data.kind === "step"
    && typeof data.projectId === "string"
    && data.projectId
    && typeof data.stepId === "string"
    && data.stepId
  ) {
    return { kind: "step", projectId: data.projectId, stepId: data.stepId };
  }
  return null;
}

export function normalizeProjectTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  value.forEach((item) => {
    if (typeof item !== "string" || tags.length >= MAX_PROJECT_TAGS) return;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, MAX_PROJECT_TAG_LENGTH);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  });
  return tags;
}

function projectFromData(id: string, value: Record<string, unknown>): ContributionProject {
  const contributors = contributorsFromData(value.contributors);
  const contributorIds = contributors.map((contributor) => contributor.id);
  const status: ContributionProjectStatus = value.status === "ongoing" || value.status === "complete"
    ? value.status
    : "one_off";
  let weightMode: AllocationMode = value.weightMode === "percent" ? "percent" : "hours";
  const hasCanonicalSteps = Array.isArray(value.steps);
  const rawSteps = hasCanonicalSteps
    ? value.steps as unknown[]
    : Array.isArray(value.subprojects) ? value.subprojects : [];
  let steps = rawSteps.flatMap((item, index): ContributionStep[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    return [{
      id: typeof data.id === "string" && data.id ? data.id : `${id}-step-${index + 1}`,
      title: typeof data.title === "string" && data.title.trim()
        ? data.title
        : `Step ${index + 1}`,
      status: data.status === "in_progress" || data.status === "done" ? data.status : "planning",
      dependency: dependencyFromData(data.dependency),
      weightValue: finiteNonNegative(data.weightValue),
      contributorMode: data.contributorMode === "percent" ? "percent" : "hours",
      contributorValues: valuesFromData(data.contributorValues, contributorIds),
    }];
  });

  if (!hasCanonicalSteps && value.subprojectsEnabled !== true) {
    const directMode: AllocationMode = value.directMode === "percent" ? "percent" : "hours";
    const directValues = valuesFromData(value.directValues, contributorIds);
    weightMode = directMode === "hours" ? "hours" : "percent";
    steps = [{
      id: `${id}-step-project-work`,
      title: "Project work",
      status: "planning",
      dependency: null,
      weightValue: directMode === "hours"
        ? allocationInputTotal(directValues, contributorIds)
        : 100,
      contributorMode: directMode,
      contributorValues: directValues,
    }];
  }

  return {
    id,
    title: typeof value.title === "string" && value.title.trim() ? value.title : "Untitled project",
    status,
    tags: normalizeProjectTags(value.tags),
    contributors,
    weightMode,
    projectHours: value.projectHours === null || value.projectHours === undefined
      ? null
      : finiteNonNegative(value.projectHours),
    steps,
    createdAt: timestampMillis(value.createdAt),
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function seedDemoProjects(): ContributionProject[] {
  const now = Date.now();
  const contributorValues = (ike: number, cron: number, josh: number) => ({ ike, cron, josh });
  return [{
    id: "promo-video-california-girls",
    title: "Promo video for California Girls",
    status: "one_off",
    tags: ["Promo", "Video", "California Girls"],
    contributors: structuredClone(DEFAULT_CONTRIBUTORS),
    weightMode: "hours",
    projectHours: null,
    steps: [
      {
        id: "prep",
        title: "Prep and plan",
        status: "done",
        dependency: null,
        weightValue: 5,
        contributorMode: "percent",
        contributorValues: contributorValues(100, 0, 0),
      },
      {
        id: "record",
        title: "Record",
        status: "in_progress",
        dependency: null,
        weightValue: 5,
        contributorMode: "percent",
        contributorValues: contributorValues(30, 70, 0),
      },
      {
        id: "mix-audio",
        title: "Mix audio",
        status: "planning",
        dependency: { kind: "step", projectId: "promo-video-california-girls", stepId: "record" },
        weightValue: 15,
        contributorMode: "hours",
        contributorValues: contributorValues(5, 5, 10),
      },
      {
        id: "edit-post",
        title: "Edit video and post",
        status: "planning",
        dependency: { kind: "step", projectId: "promo-video-california-girls", stepId: "mix-audio" },
        weightValue: 21,
        contributorMode: "percent",
        contributorValues: contributorValues(50, 50, 0),
      },
    ],
    createdAt: now - 1_000,
    updatedAt: now,
  }];
}

function isDemoMode() {
  return !hasFirebaseConfig;
}

function readDemoProjects() {
  if (typeof window === "undefined") return seedDemoProjects();
  const stored = window.localStorage.getItem(DEMO_STORE_KEY);
  if (!stored) {
    const seed = seedDemoProjects();
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return seedDemoProjects();
    return parsed.map((item, index) => projectFromData(
      typeof item?.id === "string" ? item.id : `project-${index + 1}`,
      item && typeof item === "object" ? item as Record<string, unknown> : {},
    ));
  } catch {
    return seedDemoProjects();
  }
}

function writeDemoProjects(projects: ContributionProject[]) {
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(projects));
}

export function createProjectId(prefix = "project") {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createBlankContributionProject(): ContributionProject {
  const now = Date.now();
  return {
    id: createProjectId(),
    title: "Untitled project",
    status: "one_off",
    tags: [],
    contributors: structuredClone(DEFAULT_CONTRIBUTORS),
    weightMode: "hours",
    projectHours: null,
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankStep(project: ContributionProject): ContributionStep {
  return {
    id: createProjectId("step"),
    title: `Step ${project.steps.length + 1}`,
    status: "planning",
    dependency: null,
    weightValue: 1,
    contributorMode: "hours",
    contributorValues: Object.fromEntries(project.contributors.map((item) => [item.id, 0])),
  };
}

export function duplicateContributionProject(project: ContributionProject): ContributionProject {
  const now = Date.now();
  const projectId = createProjectId();
  const stepIds = new Map(project.steps.map((step) => [step.id, createProjectId("step")]));
  return {
    ...structuredClone(project),
    id: projectId,
    title: `${project.title} copy`,
    steps: project.steps.map((step) => ({
      ...structuredClone(step),
      id: stepIds.get(step.id) ?? createProjectId("step"),
      dependency: step.dependency?.kind === "step" && step.dependency.projectId === project.id
        ? {
            kind: "step",
            projectId,
            stepId: stepIds.get(step.dependency.stepId) ?? step.dependency.stepId,
          }
        : structuredClone(step.dependency),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function allocationFractions(
  mode: AllocationMode,
  values: Record<string, number>,
  contributorIds: string[],
) {
  const normalizedValues = contributorIds.map((id) => finiteNonNegative(values[id]));
  if (mode === "percent") {
    return Object.fromEntries(
      contributorIds.map((id, index) => [id, normalizedValues[index] / 100]),
    );
  }
  const total = normalizedValues.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    contributorIds.map((id, index) => [id, total > 0 ? normalizedValues[index] / total : 0]),
  );
}

export function allocationInputTotal(values: Record<string, number>, contributorIds: string[]) {
  return contributorIds.reduce((sum, id) => sum + finiteNonNegative(values[id]), 0);
}

export function projectTotalHours(project: ContributionProject) {
  return project.weightMode === "hours"
    ? project.steps.reduce((sum, item) => sum + finiteNonNegative(item.weightValue), 0)
    : project.projectHours;
}

export function stepWeightFraction(project: ContributionProject, step: ContributionStep) {
  if (project.weightMode === "percent") return finiteNonNegative(step.weightValue) / 100;
  const total = project.steps.reduce((sum, item) => sum + finiteNonNegative(item.weightValue), 0);
  return total > 0 ? finiteNonNegative(step.weightValue) / total : 0;
}

function effectiveStepStatusInternal(
  step: ContributionStep,
  projectId: string,
  projects: ContributionProject[],
  visited: Set<string>,
): ContributionStepDisplayStatus {
  const key = `${projectId}:${step.id}`;
  if (visited.has(key)) return "blocked";
  if (!step.dependency) return step.status;
  const dependency = step.dependency;
  const nextVisited = new Set(visited).add(key);
  const dependencyProject = projects.find((project) => project.id === dependency.projectId);
  if (!dependencyProject) return "blocked";
  if (dependency.kind === "project") {
    return dependencyProject.status === "complete" ? step.status : "blocked";
  }
  const dependencyStep = dependencyProject.steps.find((item) => item.id === dependency.stepId);
  if (!dependencyStep) return "blocked";
  return effectiveStepStatusInternal(dependencyStep, dependencyProject.id, projects, nextVisited) === "done"
    ? step.status
    : "blocked";
}

export function effectiveStepStatus(
  step: ContributionStep,
  projectId: string,
  projects: ContributionProject[],
): ContributionStepDisplayStatus {
  return effectiveStepStatusInternal(step, projectId, projects, new Set());
}

export function resolveStepDependency(
  dependency: ProjectStepDependency | null,
  projects: ContributionProject[],
): StepDependencyResolution | null {
  if (!dependency) return null;
  const dependencyProject = projects.find((project) => project.id === dependency.projectId);
  if (!dependencyProject) return { label: "Missing project", blocked: true, missing: true };
  if (dependency.kind === "project") {
    return {
      label: dependencyProject.title,
      blocked: dependencyProject.status !== "complete",
      missing: false,
    };
  }
  const dependencyStep = dependencyProject.steps.find((step) => step.id === dependency.stepId);
  if (!dependencyStep) {
    return {
      label: `${dependencyProject.title} / Missing step`,
      blocked: true,
      missing: true,
    };
  }
  return {
    label: `${dependencyProject.title} / ${dependencyStep.title}`,
    blocked: effectiveStepStatus(dependencyStep, dependencyProject.id, projects) !== "done",
    missing: false,
  };
}

export function calculateProjectRollup(project: ContributionProject): ProjectRollup {
  const contributorIds = project.contributors.map((contributor) => contributor.id);
  const fractions = Object.fromEntries(contributorIds.map((id) => [id, 0])) as Record<string, number>;

  project.steps.forEach((step) => {
    const weightFraction = stepWeightFraction(project, step);
    const contributorFractions = allocationFractions(
      step.contributorMode,
      step.contributorValues,
      contributorIds,
    );
    contributorIds.forEach((id) => {
      fractions[id] += weightFraction * contributorFractions[id];
    });
  });

  const totalHours = projectTotalHours(project);
  const contributorRollups = project.contributors.map((contributor) => ({
    contributor,
    fraction: fractions[contributor.id],
    hours: totalHours === null ? null : totalHours * fractions[contributor.id],
  }));

  return {
    contributorRollups,
    totalFraction: contributorRollups.reduce((sum, item) => sum + item.fraction, 0),
    totalHours,
  };
}

export async function listContributionProjects() {
  if (isDemoMode()) return readDemoProjects().sort((left, right) => right.updatedAt - left.updatedAt);
  if (!db) throw new Error("Firebase is not configured.");
  const snapshots = await getDocs(query(collection(db, "contributionProjects"), orderBy("updatedAt", "desc")));
  return snapshots.docs.map((snapshot) => projectFromData(snapshot.id, snapshot.data()));
}

export async function saveContributionProject(project: ContributionProject) {
  const nextProject = { ...project, updatedAt: Date.now() };
  if (isDemoMode()) {
    const projects = readDemoProjects();
    const existingIndex = projects.findIndex((item) => item.id === project.id);
    if (existingIndex === -1) projects.unshift(nextProject);
    else projects[existingIndex] = nextProject;
    writeDemoProjects(projects);
    return nextProject;
  }
  if (!db) throw new Error("Firebase is not configured.");
  await setDoc(doc(db, "contributionProjects", project.id), {
    title: project.title,
    status: project.status,
    tags: normalizeProjectTags(project.tags),
    contributors: project.contributors,
    weightMode: project.weightMode,
    projectHours: project.projectHours,
    steps: project.steps,
    createdAt: project.createdAt,
    updatedAt: serverTimestamp(),
  });
  return nextProject;
}

export async function deleteContributionProject(projectId: string) {
  if (isDemoMode()) {
    writeDemoProjects(readDemoProjects().filter((project) => project.id !== projectId));
    return;
  }
  if (!db) throw new Error("Firebase is not configured.");
  await deleteDoc(doc(db, "contributionProjects", projectId));
}
