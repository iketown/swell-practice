"use client";

import {
  CopyPlusIcon,
  FolderKanbanIcon,
  ListFilterIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import {
  allocationFractions,
  allocationInputTotal,
  calculateProjectRollup,
  createBlankContributionProject,
  createBlankStep,
  createProjectId,
  deleteContributionProject,
  duplicateContributionProject,
  effectiveStepStatus,
  listContributionProjects,
  MAX_PROJECT_TAG_LENGTH,
  MAX_PROJECT_TAGS,
  normalizeProjectTags,
  projectTotalHours,
  resolveStepDependency,
  saveContributionProject,
  stepWeightFraction,
  type AllocationMode,
  type ContributionProject,
  type ContributionProjectStatus,
  type ContributionStep,
  type ContributionStepDisplayStatus,
  type ContributionStepStatus,
  type ProjectStepDependency,
  type ProjectContributor,
} from "@/lib/project-contributions";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ label: string; value: ContributionProjectStatus }> = [
  { label: "One-off", value: "one_off" },
  { label: "Ongoing", value: "ongoing" },
  { label: "Complete", value: "complete" },
];

const STEP_STATUS_OPTIONS: Array<{ label: string; value: ContributionStepStatus }> = [
  { label: "Planning", value: "planning" },
  { label: "In progress", value: "in_progress" },
  { label: "Done", value: "done" },
];

const NO_DEPENDENCY_VALUE = "none";

const CONTRIBUTOR_BAR_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

type SaveState = "saved" | "saving" | "error";

type DeleteTarget =
  | { kind: "project"; project: ContributionProject }
  | { kind: "step"; project: ContributionProject; step: ContributionStep };

function safeNumber(value: string) {
  if (!value.trim()) return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function formatPercent(fraction: number) {
  const percent = fraction * 100;
  return `${percent.toFixed(Math.abs(percent - Math.round(percent)) < 0.05 ? 0 : 1)}%`;
}

function formatHours(hours: number | null) {
  if (hours === null) return "Hours needed";
  const digits = Math.abs(hours - Math.round(hours)) < 0.05 ? 0 : 1;
  return `${hours.toFixed(digits)}h`;
}

function modeLabel(mode: AllocationMode) {
  return mode === "hours" ? "Hours" : "Percent";
}

function statusLabel(status: ContributionProjectStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "One-off";
}

function stepStatusLabel(status: ContributionStepDisplayStatus) {
  if (status === "blocked") return "Blocked";
  return STEP_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Planning";
}

function dependencyValue(dependency: ProjectStepDependency | null) {
  if (!dependency) return NO_DEPENDENCY_VALUE;
  return dependency.kind === "project"
    ? `project:${dependency.projectId}`
    : `step:${dependency.projectId}:${dependency.stepId}`;
}

function dependencyFromValue(value: string): ProjectStepDependency | null {
  if (value === NO_DEPENDENCY_VALUE) return null;
  const [kind, projectId, stepId] = value.split(":");
  if (kind === "project" && projectId) return { kind: "project", projectId };
  if (kind === "step" && projectId && stepId) return { kind: "step", projectId, stepId };
  return null;
}

function tagKey(tag: string) {
  return tag.trim().toLocaleLowerCase();
}

function isBalanced(total: number) {
  return Math.abs(total - 100) < 0.05;
}

function contributorId(name: string, project: ContributionProject) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "contributor";
  return project.contributors.some((contributor) => contributor.id === base)
    ? createProjectId(base)
    : base;
}

function ModeToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AllocationMode;
  onChange: (mode: AllocationMode) => void;
}) {
  const labelId = useId();
  return (
    <Field orientation="horizontal" className="w-auto">
      <FieldTitle id={labelId}>{label}</FieldTitle>
      <ToggleGroup
        aria-labelledby={labelId}
        onValueChange={(nextValue) => {
          const nextMode = nextValue[0] as AllocationMode | undefined;
          if (nextMode) onChange(nextMode);
        }}
        size="sm"
        spacing={0}
        value={[value]}
        variant="outline"
      >
        <ToggleGroupItem value="hours">Hours</ToggleGroupItem>
        <ToggleGroupItem value="percent">Percent</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}

function NumberWithUnit({
  id,
  ariaLabel,
  unit,
  value,
  onChange,
}: {
  id?: string;
  ariaLabel: string;
  unit: "h" | "%";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        aria-label={ariaLabel}
        id={id}
        inputMode="decimal"
        min="0"
        onChange={(event) => onChange(safeNumber(event.target.value))}
        step={unit === "h" ? "0.25" : "0.1"}
        type="number"
        value={value || ""}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

function AllocationEditor({
  baseHours,
  contributors,
  idPrefix,
  label,
  mode,
  values,
  onModeChange,
  onValuesChange,
}: {
  baseHours: number | null;
  contributors: ProjectContributor[];
  idPrefix: string;
  label: string;
  mode: AllocationMode;
  values: Record<string, number>;
  onModeChange: (mode: AllocationMode) => void;
  onValuesChange: (values: Record<string, number>) => void;
}) {
  const contributorIds = contributors.map((contributor) => contributor.id);
  const fractions = allocationFractions(mode, values, contributorIds);
  const inputTotal = allocationInputTotal(values, contributorIds);
  const balanced = mode === "hours" ? inputTotal > 0 : isBalanced(inputTotal);

  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeToggle label={label} onChange={onModeChange} value={mode} />
        <Badge variant={balanced ? "secondary" : "destructive"}>
          {mode === "hours"
            ? inputTotal > 0 ? `${formatHours(inputTotal)} entered` : "Add contributor hours"
            : isBalanced(inputTotal) ? "100% allocated" : `${inputTotal.toFixed(1)}% allocated`}
        </Badge>
      </div>
      <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contributors.map((contributor) => {
          const fraction = fractions[contributor.id] ?? 0;
          const actualHours = baseHours === null ? null : baseHours * fraction;
          return (
            <Field key={contributor.id}>
              <FieldLabel htmlFor={`allocation-${idPrefix}-${contributor.id}`}>{contributor.name}</FieldLabel>
              <NumberWithUnit
                ariaLabel={`${contributor.name} ${modeLabel(mode).toLowerCase()} for ${label}`}
                id={`allocation-${idPrefix}-${contributor.id}`}
                onChange={(nextValue) => onValuesChange({
                  ...values,
                  [contributor.id]: nextValue,
                })}
                unit={mode === "hours" ? "h" : "%"}
                value={values[contributor.id] ?? 0}
              />
              <FieldDescription>
                {formatPercent(fraction)} share{actualHours === null ? "" : `, ${formatHours(actualHours)} project time`}
              </FieldDescription>
            </Field>
          );
        })}
      </FieldGroup>
    </div>
  );
}

function ContributorAdder({
  project,
  onAdd,
}: {
  project: ContributionProject;
  onAdd: (contributor: ProjectContributor) => void;
}) {
  const [name, setName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (project.contributors.some((contributor) => contributor.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`${trimmed} is already a contributor.`);
      return;
    }
    onAdd({ id: contributorId(trimmed, project), name: trimmed });
    setName("");
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel className="sr-only" htmlFor={`add-contributor-${project.id}`}>
            Contributor name
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={`add-contributor-${project.id}`}
              onChange={(event) => setName(event.target.value)}
              placeholder="Add contributor"
              value={name}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label="Add contributor" disabled={!name.trim()} type="submit">
                <UserPlusIcon aria-hidden />
                Add
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
    </form>
  );
}

function ProjectTagEditor({
  project,
  onChange,
}: {
  project: ContributionProject;
  onChange: (project: ContributionProject) => void;
}) {
  const [tag, setTag] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [nextTag] = normalizeProjectTags([tag]);
    if (!nextTag) return;
    if (project.tags.some((currentTag) => tagKey(currentTag) === tagKey(nextTag))) {
      toast.error(`${nextTag} is already a tag.`);
      return;
    }
    if (project.tags.length >= MAX_PROJECT_TAGS) {
      toast.error(`Projects can have up to ${MAX_PROJECT_TAGS} tags.`);
      return;
    }
    onChange({ ...project, tags: normalizeProjectTags([...project.tags, nextTag]) });
    setTag("");
  }

  function removeTag(tagToRemove: string) {
    onChange({
      ...project,
      tags: project.tags.filter((currentTag) => tagKey(currentTag) !== tagKey(tagToRemove)),
    });
  }

  return (
    <section
      aria-labelledby={`project-tags-${project.id}`}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold" id={`project-tags-${project.id}`}>Tags</h3>
        {project.tags.length ? (
          <div className="flex flex-wrap gap-2">
            {project.tags.map((projectTag) => (
              <Badge
                aria-label={`Remove ${projectTag} tag`}
                className="cursor-pointer hover:bg-secondary/80"
                key={tagKey(projectTag)}
                onClick={() => removeTag(projectTag)}
                render={<button type="button" />}
                title={`Remove ${projectTag}`}
                variant="secondary"
              >
                {projectTag}
                <XIcon aria-hidden data-icon="inline-end" />
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        )}
      </div>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel className="sr-only" htmlFor={`add-project-tag-${project.id}`}>
              Tag name
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`add-project-tag-${project.id}`}
                maxLength={MAX_PROJECT_TAG_LENGTH}
                onChange={(event) => setTag(event.target.value)}
                placeholder="Add tag"
                value={tag}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Add tag"
                  disabled={!tag.trim() || project.tags.length >= MAX_PROJECT_TAGS}
                  type="submit"
                >
                  <TagIcon aria-hidden />
                  Add
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}

function ProjectTagFilter({
  tags,
  value,
  onChange,
  filteredCount,
  projectCount,
}: {
  tags: string[];
  value: string[];
  onChange: (tags: string[]) => void;
  filteredCount: number;
  projectCount: number;
}) {
  const labelId = useId();

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ListFilterIcon aria-hidden />
          <div>
            <h2 className="text-sm font-semibold" id={labelId}>Filter by tags</h2>
            <p className="text-xs text-muted-foreground">
              {value.length
                ? `Matching any selected tag · ${filteredCount} of ${projectCount} projects`
                : `${projectCount} projects · select one or more tags`}
            </p>
          </div>
        </div>
        {value.length ? (
          <Button onClick={() => onChange([])} size="xs" type="button" variant="ghost">
            <XIcon data-icon="inline-start" />
            Clear
          </Button>
        ) : null}
      </div>
      <ToggleGroup
        aria-label="Project tag filters"
        className="flex w-full flex-wrap justify-start"
        onValueChange={onChange}
        size="sm"
        value={value}
        variant="outline"
      >
        {tags.map((projectTag) => (
          <ToggleGroupItem key={tagKey(projectTag)} value={projectTag}>
            {projectTag}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );
}

function RollupSummary({ project }: { project: ContributionProject }) {
  const rollup = calculateProjectRollup(project);

  return (
    <section aria-labelledby={`rollup-${project.id}`} className="flex flex-col gap-4 rounded-md bg-secondary/55 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="swell-page-kicker">Composite contribution</p>
          <h3 className="text-lg font-semibold" id={`rollup-${project.id}`}>Project rollup</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatHours(rollup.totalHours)} total</Badge>
          {!isBalanced(rollup.totalFraction * 100) ? (
            <Badge variant="destructive">{formatPercent(rollup.totalFraction)} allocated</Badge>
          ) : null}
        </div>
      </div>
      <div aria-label="Contributor share of project" className="flex h-2 overflow-hidden rounded-full bg-muted">
        {rollup.contributorRollups.map((item, index) => (
          <span
            aria-hidden
            className={cn("h-full", CONTRIBUTOR_BAR_CLASSES[index % CONTRIBUTOR_BAR_CLASSES.length])}
            key={item.contributor.id}
            style={{ width: `${Math.max(0, item.fraction * 100)}%` }}
          />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {rollup.contributorRollups.map((item) => (
          <Progress key={item.contributor.id} value={Math.max(0, Math.min(100, item.fraction * 100))}>
            <ProgressLabel>{item.contributor.name}</ProgressLabel>
            <ProgressValue>
              {() => `${formatPercent(item.fraction)}${item.hours === null ? "" : ` · ${formatHours(item.hours)}`}`}
            </ProgressValue>
          </Progress>
        ))}
      </div>
      {rollup.totalHours === null ? (
        <p className="text-xs text-muted-foreground">
          Add total project hours to turn percentage shares into hours.
        </p>
      ) : null}
    </section>
  );
}

function StepEditor({
  allProjects,
  project,
  step,
  onChange,
  onDelete,
}: {
  allProjects: ContributionProject[];
  project: ContributionProject;
  step: ContributionStep;
  onChange: (step: ContributionStep) => void;
  onDelete: () => void;
}) {
  const totalHours = projectTotalHours(project);
  const weightFraction = stepWeightFraction(project, step);
  const stepHours = totalHours === null ? null : totalHours * weightFraction;
  const displayStatus = effectiveStepStatus(step, project.id, allProjects);
  const dependencyResolution = resolveStepDependency(step.dependency, allProjects);
  const dependencyItems = useMemo(() => [
    { label: "No dependency", value: NO_DEPENDENCY_VALUE },
    ...allProjects.flatMap((dependencyProject) => [
      ...(dependencyProject.id === project.id ? [] : [{
        label: `Project: ${dependencyProject.title}`,
        value: `project:${dependencyProject.id}`,
      }]),
      ...dependencyProject.steps
        .filter((dependencyStep) => (
          dependencyProject.id !== project.id || dependencyStep.id !== step.id
        ))
        .map((dependencyStep) => ({
          label: `${dependencyProject.title} / ${dependencyStep.title}`,
          value: `step:${dependencyProject.id}:${dependencyStep.id}`,
        })),
    ]),
  ], [allProjects, project.id, step.id]);

  function changeStatus(value: ContributionStepStatus) {
    if (value === "done" && dependencyResolution?.blocked) {
      toast.error(`Finish ${dependencyResolution.label} before marking this step done.`);
      return;
    }
    onChange({ ...step, status: value });
  }

  return (
    <section aria-labelledby={`step-${step.id}`} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
      <FieldGroup className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_10rem_9rem_7rem_auto] md:items-end">
        <Field>
          <FieldLabel htmlFor={`step-${step.id}`}>Step</FieldLabel>
          <Input
            id={`step-${step.id}`}
            onChange={(event) => onChange({ ...step, title: event.target.value })}
            value={step.title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`step-status-${step.id}`}>Status</FieldLabel>
          <Select
            items={STEP_STATUS_OPTIONS}
            onValueChange={(value) => value && changeStatus(value as ContributionStepStatus)}
            value={step.status}
          >
            <SelectTrigger className="w-full" id={`step-status-${step.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {STEP_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`weight-${step.id}`}>
            {project.weightMode === "hours" ? "Project hours" : "Project weight"}
          </FieldLabel>
          <NumberWithUnit
            ariaLabel={`${step.title} project ${modeLabel(project.weightMode).toLowerCase()}`}
            id={`weight-${step.id}`}
            onChange={(weightValue) => onChange({ ...step, weightValue })}
            unit={project.weightMode === "hours" ? "h" : "%"}
            value={step.weightValue}
          />
        </Field>
        <Field>
          <FieldLabel>Calculated weight</FieldLabel>
          <div className="flex h-8 items-center font-mono text-sm tabular-nums">
            {formatPercent(weightFraction)}
          </div>
        </Field>
        <Button
          aria-label={`Delete ${step.title}`}
          onClick={onDelete}
          size="icon-sm"
          title={`Delete ${step.title}`}
          type="button"
          variant="ghost"
        >
          <Trash2Icon aria-hidden />
        </Button>
      </FieldGroup>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`step-dependency-${step.id}`}>Depends on</FieldLabel>
          <Select
            items={dependencyItems}
            onValueChange={(value) => value && onChange({
              ...step,
              dependency: dependencyFromValue(value),
            })}
            value={dependencyValue(step.dependency)}
          >
            <SelectTrigger className="w-full" id={`step-dependency-${step.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value={NO_DEPENDENCY_VALUE}>No dependency</SelectItem>
              </SelectGroup>
              {allProjects.map((dependencyProject) => {
                const availableSteps = dependencyProject.steps.filter((dependencyStep) => (
                  dependencyProject.id !== project.id || dependencyStep.id !== step.id
                ));
                if (dependencyProject.id === project.id && !availableSteps.length) return null;
                return (
                  <SelectGroup key={dependencyProject.id}>
                    <SelectLabel>{dependencyProject.title}</SelectLabel>
                    {dependencyProject.id !== project.id ? (
                      <SelectItem value={`project:${dependencyProject.id}`}>
                        Entire project · {dependencyProject.status === "complete" ? "Complete" : "Not complete"}
                      </SelectItem>
                    ) : null}
                    {availableSteps.map((dependencyStep) => (
                      <SelectItem
                        key={dependencyStep.id}
                        value={`step:${dependencyProject.id}:${dependencyStep.id}`}
                      >
                        {dependencyStep.title} · {stepStatusLabel(
                          effectiveStepStatus(dependencyStep, dependencyProject.id, allProjects),
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          {dependencyResolution ? (
            <FieldDescription className="flex flex-wrap items-center gap-2">
              <Badge variant={displayStatus === "blocked" ? "destructive" : "secondary"}>
                {displayStatus === "blocked" ? "Blocked" : "Dependency done"}
              </Badge>
              {displayStatus === "blocked"
                ? `Waiting for ${dependencyResolution.label}.`
                : `${dependencyResolution.label} is done.`}
            </FieldDescription>
          ) : (
            <FieldDescription>Optional. Link this step to another project or step.</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <AllocationEditor
        baseHours={stepHours}
        contributors={project.contributors}
        idPrefix={step.id}
        label={`${step.title} contributors`}
        mode={step.contributorMode}
        onModeChange={(contributorMode) => onChange({ ...step, contributorMode })}
        onValuesChange={(contributorValues) => onChange({ ...step, contributorValues })}
        values={step.contributorValues}
      />
    </section>
  );
}

function ProjectAccordionHeader({
  allProjects,
  project,
  saveState,
}: {
  allProjects: ContributionProject[];
  project: ContributionProject;
  saveState: SaveState;
}) {
  const rollup = calculateProjectRollup(project);
  const blockedStepCount = project.steps.filter((step) => (
    effectiveStepStatus(step, project.id, allProjects) === "blocked"
  )).length;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 pr-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate text-base font-semibold sm:text-lg">
          {project.title.trim() || "Untitled project"}
        </span>
        <Badge variant={project.status === "complete" ? "secondary" : "outline"}>
          {statusLabel(project.status)}
        </Badge>
        {project.tags.slice(0, 3).map((projectTag) => (
          <Badge key={tagKey(projectTag)} variant="secondary">{projectTag}</Badge>
        ))}
        {project.tags.length > 3 ? (
          <Badge variant="ghost">+{project.tags.length - 3} tags</Badge>
        ) : null}
        {blockedStepCount ? (
          <Badge variant="destructive">
            {blockedStepCount} blocked {blockedStepCount === 1 ? "step" : "steps"}
          </Badge>
        ) : null}
        {saveState === "saving" ? <Badge variant="ghost">Saving</Badge> : null}
        {saveState === "error" ? <Badge variant="destructive">Save failed</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
        <span>{project.steps.length} {project.steps.length === 1 ? "step" : "steps"}</span>
        <span>{formatHours(rollup.totalHours)} total</span>
        {rollup.contributorRollups.map((item) => (
          <span className="tabular-nums" key={item.contributor.id}>
            {item.contributor.name} {formatPercent(item.fraction)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectEditor({
  allProjects,
  project,
  onChange,
  onDuplicate,
  onDeleteProject,
  onDeleteStep,
}: {
  allProjects: ContributionProject[];
  project: ContributionProject;
  onChange: (project: ContributionProject) => void;
  onDuplicate: () => void;
  onDeleteProject: () => void;
  onDeleteStep: (step: ContributionStep) => void;
}) {
  const weightTotal = project.steps.reduce((sum, step) => sum + step.weightValue, 0);

  function changeStep(nextStep: ContributionStep) {
    onChange({
      ...project,
      steps: project.steps.map((step) => (
        step.id === nextStep.id ? nextStep : step
      )),
    });
  }

  function addContributor(contributor: ProjectContributor) {
    onChange({
      ...project,
      contributors: [...project.contributors, contributor],
      steps: project.steps.map((step) => ({
        ...step,
        contributorValues: { ...step.contributorValues, [contributor.id]: 0 },
      })),
    });
  }

  return (
    <div className="flex flex-col gap-6 pt-2">
      <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_10rem_auto] lg:items-end">
        <Field>
          <FieldLabel htmlFor={`project-title-${project.id}`}>Project name</FieldLabel>
          <Input
            id={`project-title-${project.id}`}
            onChange={(event) => onChange({ ...project, title: event.target.value })}
            value={project.title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`project-status-${project.id}`}>Project type</FieldLabel>
          <Select
            items={STATUS_OPTIONS}
            onValueChange={(value) => value && onChange({
              ...project,
              status: value as ContributionProjectStatus,
            })}
            value={project.status}
          >
            <SelectTrigger className="w-full" id={`project-status-${project.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button onClick={onDuplicate} size="sm" type="button" variant="outline">
            <CopyPlusIcon data-icon="inline-start" />
            Duplicate
          </Button>
          <Button onClick={onDeleteProject} size="sm" type="button" variant="ghost">
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </FieldGroup>

      <ProjectTagEditor onChange={onChange} project={project} />

      <Separator />

      <section aria-labelledby={`contributors-${project.id}`} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold" id={`contributors-${project.id}`}>Contributors</h3>
          <div className="flex flex-wrap gap-2">
            {project.contributors.map((contributor) => (
              <Badge key={contributor.id} variant="secondary">{contributor.name}</Badge>
            ))}
          </div>
        </div>
        <ContributorAdder onAdd={addContributor} project={project} />
      </section>

      <Separator />

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <ModeToggle
              label="Step weights"
              onChange={(weightMode) => onChange({ ...project, weightMode })}
              value={project.weightMode}
            />
            <Badge
              variant={project.weightMode === "hours" || isBalanced(weightTotal) ? "secondary" : "destructive"}
            >
              {project.weightMode === "hours"
                ? `${formatHours(weightTotal)} total`
                : isBalanced(weightTotal) ? "100% weighted" : `${weightTotal.toFixed(1)}% weighted`}
            </Badge>
          </div>
          {project.weightMode === "percent" ? (
            <Field className="w-full sm:w-48">
              <FieldLabel htmlFor={`project-hours-${project.id}`}>Total project hours</FieldLabel>
              <NumberWithUnit
                ariaLabel="Total project hours"
                id={`project-hours-${project.id}`}
                onChange={(projectHours) => onChange({ ...project, projectHours })}
                unit="h"
                value={project.projectHours ?? 0}
              />
              <FieldDescription>Needed for the hour rollup.</FieldDescription>
            </Field>
          ) : null}
        </div>

        {project.steps.length ? (
          <div className="divide-y">
            {project.steps.map((step) => (
              <StepEditor
                allProjects={allProjects}
                key={step.id}
                onChange={changeStep}
                onDelete={() => onDeleteStep(step)}
                project={project}
                step={step}
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-40 border">
            <EmptyHeader>
              <EmptyTitle>No steps yet</EmptyTitle>
              <EmptyDescription>Add the first piece of work, then assign its weight and contributors.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Button
          className="self-start"
          onClick={() => onChange({
            ...project,
            steps: [...project.steps, createBlankStep(project)],
          })}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon data-icon="inline-start" />
          Add step
        </Button>
      </div>

      <RollupSummary project={project} />
    </div>
  );
}

export function ProjectContributionsClient() {
  const admin = useAdmin();
  const router = useRouter();
  const isSignedInAdmin = Boolean(admin.user && admin.isAdmin);
  const [projects, setProjects] = useState<ContributionProject[]>([]);
  const [openProjectIds, setOpenProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const saveTimers = useRef(new Map<string, number>());

  const availableTags = useMemo(() => {
    const tagsByKey = new Map<string, string>();
    projects.forEach((project) => {
      project.tags.forEach((projectTag) => {
        if (!tagsByKey.has(tagKey(projectTag))) tagsByKey.set(tagKey(projectTag), projectTag);
      });
    });
    selectedTags.forEach((projectTag) => {
      if (!tagsByKey.has(tagKey(projectTag))) tagsByKey.set(tagKey(projectTag), projectTag);
    });
    return [...tagsByKey.values()].sort((left, right) => left.localeCompare(right));
  }, [projects, selectedTags]);
  const selectedTagKeys = useMemo(
    () => new Set(selectedTags.map((projectTag) => tagKey(projectTag))),
    [selectedTags],
  );
  const filteredProjects = useMemo(
    () => selectedTagKeys.size
      ? projects.filter((project) => (
          project.tags.some((projectTag) => selectedTagKeys.has(tagKey(projectTag)))
        ))
      : projects,
    [projects, selectedTagKeys],
  );

  useEffect(() => {
    if (!admin.loading && !isSignedInAdmin) router.replace("/");
  }, [admin.loading, isSignedInAdmin, router]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProjects = await listContributionProjects();
      setProjects(nextProjects);
      setOpenProjectIds(nextProjects[0] ? [nextProjects[0].id] : []);
      setSaveStates(Object.fromEntries(nextProjects.map((project) => [project.id, "saved"])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSignedInAdmin) return;
    const timeout = window.setTimeout(() => void loadProjects(), 0);
    return () => window.clearTimeout(timeout);
  }, [isSignedInAdmin, loadProjects]);

  useEffect(() => () => {
    saveTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function queueSave(project: ContributionProject) {
    const existingTimer = saveTimers.current.get(project.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    setSaveStates((current) => ({ ...current, [project.id]: "saving" }));
    const timer = window.setTimeout(async () => {
      try {
        await saveContributionProject(project);
        setSaveStates((current) => ({ ...current, [project.id]: "saved" }));
      } catch (caught) {
        console.error(caught);
        setSaveStates((current) => ({ ...current, [project.id]: "error" }));
        toast.error(`Could not save ${project.title || "project"}.`);
      } finally {
        saveTimers.current.delete(project.id);
      }
    }, 450);
    saveTimers.current.set(project.id, timer);
  }

  function changeProject(project: ContributionProject) {
    const nextProject = { ...project, updatedAt: Date.now() };
    setProjects((current) => current.map((item) => item.id === project.id ? nextProject : item));
    queueSave(nextProject);
  }

  async function createProject() {
    const project = createBlankContributionProject();
    setSelectedTags([]);
    setProjects((current) => [project, ...current]);
    setOpenProjectIds((current) => [project.id, ...current]);
    setSaveStates((current) => ({ ...current, [project.id]: "saving" }));
    try {
      await saveContributionProject(project);
      setSaveStates((current) => ({ ...current, [project.id]: "saved" }));
      toast.success("Project created.");
    } catch (caught) {
      console.error(caught);
      setSaveStates((current) => ({ ...current, [project.id]: "error" }));
      toast.error("Could not create the project.");
    }
  }

  async function duplicateProject(project: ContributionProject) {
    const duplicate = duplicateContributionProject(project);
    setProjects((current) => [duplicate, ...current]);
    setOpenProjectIds((current) => [duplicate.id, ...current]);
    setSaveStates((current) => ({ ...current, [duplicate.id]: "saving" }));
    try {
      await saveContributionProject(duplicate);
      setSaveStates((current) => ({ ...current, [duplicate.id]: "saved" }));
      toast.success(`${project.title} duplicated.`);
    } catch (caught) {
      console.error(caught);
      setSaveStates((current) => ({ ...current, [duplicate.id]: "error" }));
      toast.error("Could not duplicate the project.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "step") {
      changeProject({
        ...deleteTarget.project,
        steps: deleteTarget.project.steps.filter(
          (step) => step.id !== deleteTarget.step.id,
        ),
      });
      toast.success(`${deleteTarget.step.title} deleted.`);
      setDeleteTarget(null);
      return;
    }

    const project = deleteTarget.project;
    try {
      const timer = saveTimers.current.get(project.id);
      if (timer) window.clearTimeout(timer);
      saveTimers.current.delete(project.id);
      await deleteContributionProject(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setOpenProjectIds((current) => current.filter((id) => id !== project.id));
      toast.success(`${project.title} deleted.`);
    } catch (caught) {
      console.error(caught);
      toast.error(`Could not delete ${project.title}.`);
    } finally {
      setDeleteTarget(null);
    }
  }

  if (admin.loading || !isSignedInAdmin) {
    return (
      <AppShell>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <p className="swell-page-kicker">Production planning</p>
          <h1 className="text-3xl font-semibold tracking-tight">Project contributions</h1>
          <p className="text-sm text-muted-foreground">
            Weight each step, link dependencies, split the work, and see the project-wide mix in hours and percent.
          </p>
        </div>
        <Button onClick={() => void createProject()}>
          <PlusIcon data-icon="inline-start" />
          New project
        </Button>
      </header>

      {error ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderKanbanIcon /></EmptyMedia>
            <EmptyTitle>Projects could not load</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void loadProjects()} variant="outline">Try again</Button>
          </EmptyContent>
        </Empty>
      ) : loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : projects.length ? (
        <div className="flex flex-col gap-4">
          {availableTags.length ? (
            <ProjectTagFilter
              filteredCount={filteredProjects.length}
              onChange={setSelectedTags}
              projectCount={projects.length}
              tags={availableTags}
              value={selectedTags}
            />
          ) : null}
          {filteredProjects.length ? (
            <Accordion
              multiple
              onValueChange={(value) => setOpenProjectIds(value)}
              value={openProjectIds}
            >
              {filteredProjects.map((project) => (
                <AccordionItem key={project.id} value={project.id}>
                  <AccordionTrigger>
                    <ProjectAccordionHeader
                      allProjects={projects}
                      project={project}
                      saveState={saveStates[project.id] ?? "saved"}
                    />
                  </AccordionTrigger>
                  <AccordionContent>
                    <ProjectEditor
                      allProjects={projects}
                      onChange={changeProject}
                      onDeleteProject={() => setDeleteTarget({ kind: "project", project })}
                      onDeleteStep={(step) => setDeleteTarget({
                        kind: "step",
                        project,
                        step,
                      })}
                      onDuplicate={() => void duplicateProject(project)}
                      project={project}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Empty className="min-h-56 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ListFilterIcon /></EmptyMedia>
                <EmptyTitle>No projects match these tags</EmptyTitle>
                <EmptyDescription>Clear the filters or select a different tag.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setSelectedTags([])} variant="outline">Clear filters</Button>
              </EmptyContent>
            </Empty>
          )}
        </div>
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderKanbanIcon /></EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create a project, then add weighted steps and assign their contributors.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void createProject()}>
              <PlusIcon data-icon="inline-start" />
              Create first project
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.kind === "step" ? deleteTarget.step.title : deleteTarget?.project.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "step"
                ? "Its weight and contributor assignments will be removed from this project."
                : "The project, its steps, and all contributor assignments will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} variant="destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
