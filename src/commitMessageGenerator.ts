import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { getMessage } from './i18n/i18n';

const COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY = 'commitMessage.modelVendor';
const COMMIT_MESSAGE_MODEL_ID_SETTING_KEY = 'commitMessage.modelId';
const COMMIT_MESSAGE_USE_RECENT_STYLE_SETTING_KEY = 'commitMessage.useRecentCommitStyle';
const COMMIT_MESSAGE_OPTIONS_SETTING_KEY = 'commitMessage.options';
const COMMIT_MESSAGE_OPTIONS_PROMPT_KEY = 'prompt';
const COMMIT_MESSAGE_OPTIONS_MAX_DIFF_LINES_KEY = 'maxDiffLines';
const COMMIT_MESSAGE_OPTIONS_PIPELINE_MODE_KEY = 'pipelineMode';
const COMMIT_MESSAGE_OPTIONS_SUMMARY_TRIGGER_LINES_KEY = 'summaryTriggerLines';
const COMMIT_MESSAGE_OPTIONS_SUMMARY_CHUNK_LINES_KEY = 'summaryChunkLines';
const COMMIT_MESSAGE_OPTIONS_SUMMARY_MAX_CHUNKS_KEY = 'summaryMaxChunks';
const COMMIT_MESSAGE_OPTIONS_BODY_BULLET_COUNT_KEY = 'bodyBulletCount';
const COMMIT_MESSAGE_OPTIONS_SUBJECT_MAX_LENGTH_KEY = 'subjectMaxLength';
const COMMIT_MESSAGE_OPTIONS_REQUIRE_CONVENTIONAL_TYPE_KEY = 'requireConventionalType';
const COMMIT_MESSAGE_OPTIONS_WARN_ON_VALIDATION_FAILURE_KEY = 'warnOnValidationFailure';

// Legacy keys kept for backward compatibility with existing user settings.
const LEGACY_COMMIT_MESSAGE_PROMPT_SETTING_KEY = 'commitMessage.prompt';
const LEGACY_COMMIT_MESSAGE_MAX_DIFF_LINES_SETTING_KEY = 'commitMessage.maxDiffLines';
const LEGACY_COMMIT_MESSAGE_PIPELINE_MODE_SETTING_KEY = 'commitMessage.pipelineMode';
const LEGACY_COMMIT_MESSAGE_SUMMARY_TRIGGER_LINES_SETTING_KEY = 'commitMessage.summaryTriggerLines';
const LEGACY_COMMIT_MESSAGE_SUMMARY_CHUNK_LINES_SETTING_KEY = 'commitMessage.summaryChunkLines';
const LEGACY_COMMIT_MESSAGE_SUMMARY_MAX_CHUNKS_SETTING_KEY = 'commitMessage.summaryMaxChunks';
const LEGACY_COMMIT_MESSAGE_BODY_BULLET_COUNT_SETTING_KEY = 'commitMessage.bodyBulletCount';
const LEGACY_COMMIT_MESSAGE_SUBJECT_MAX_LENGTH_SETTING_KEY = 'commitMessage.subjectMaxLength';
const LEGACY_COMMIT_MESSAGE_REQUIRE_CONVENTIONAL_TYPE_SETTING_KEY = 'commitMessage.requireConventionalType';
const LEGACY_COMMIT_MESSAGE_WARN_ON_VALIDATION_FAILURE_SETTING_KEY = 'commitMessage.warnOnValidationFailure';

const DEFAULT_COMMIT_MESSAGE_MAX_DIFF_LINES = 3000;
const DEFAULT_PIPELINE_MODE: CommitMessagePipelineMode = 'single';
const DEFAULT_SUMMARY_TRIGGER_LINES = 1200;
const DEFAULT_SUMMARY_CHUNK_LINES = 800;
const DEFAULT_SUMMARY_MAX_CHUNKS = 12;
const DEFAULT_BODY_BULLET_COUNT = 7;
const DEFAULT_SUBJECT_MAX_LENGTH = 72;
const DEFAULT_REQUIRE_CONVENTIONAL_TYPE = true;
const DEFAULT_WARN_ON_VALIDATION_FAILURE = true;
const DEFAULT_RECENT_COMMIT_STYLE_SAMPLE_SIZE = 20;
const RECENT_COMMIT_STYLE_MAX_ENTRY_LENGTH = 500;
const RECENT_COMMIT_STYLE_MAX_TOTAL_LENGTH = 5000;
const COMMIT_LOG_ENTRY_SEPARATOR = '\u001e';

const CODING_PLANS_VENDOR = 'coding-plans';
const COMMIT_MESSAGE_TASK_BLOCK = [
  'TASK: Generate a complete multi-line git commit message from change information.',
  'You are a Git commit message generator.'
].join('\n');
const DEFAULT_COMMIT_FORMAT_PROMPT = [
  'FORMAT REQUIREMENT:',
  'Follow the Conventional Commits format: <type>(<scope>): <description>.',
  'Common types: feat, fix, docs, style, refactor, perf, test, build, ci, chore.',
  'Output ONLY the commit message, no explanation, no markdown fences.'
].join('\n');
const SUMMARY_JSON_SCHEMA = [
  '{',
  '  "filesChanged": ["relative/path.ts"],',
  '  "majorChanges": ["what changed and why"],',
  '  "riskNotes": ["potential risk or migration note"],',
  '  "breakingChange": false',
  '}'
].join('\n');
const PLACEHOLDER_MODEL_ID_SUFFIXES = ['__setup_api_key__', '__no_models__', '__unsupported__', '__vendor_not_configured__'] as const;
const CONVENTIONAL_COMMIT_SUBJECT_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9_.\-\/]+\))?!?: .+/i;

interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: GitRepository[];
}

interface GitRepository {
  rootUri?: vscode.Uri;
  inputBox: { value: string };
  diff(cached?: boolean): Promise<string>;
  state: { indexChanges: unknown[]; workingTreeChanges: unknown[] };
}

type CommitMessageLanguage = 'en' | 'zh-cn';
type CommitMessagePipelineMode = 'single' | 'two-stage' | 'auto';
type LanguageEnforcementRule = {
  outputRequirement: string;
};

type CommitMessageSettings = {
  pipelineMode: CommitMessagePipelineMode;
  maxDiffLines: number;
  summaryTriggerLines: number;
  summaryChunkLines: number;
  summaryMaxChunks: number;
  bodyBulletCount: number;
  subjectMaxLength: number;
  requireConventionalType: boolean;
  warnOnValidationFailure: boolean;
};

type CommitMessageOptions = {
  prompt?: string;
  maxDiffLines?: number;
  pipelineMode?: CommitMessagePipelineMode;
  summaryTriggerLines?: number;
  summaryChunkLines?: number;
  summaryMaxChunks?: number;
  bodyBulletCount?: number;
  subjectMaxLength?: number;
  requireConventionalType?: boolean;
  warnOnValidationFailure?: boolean;
};

type DiffSummary = {
  filesChanged: string[];
  majorChanges: string[];
  riskNotes: string[];
  breakingChange: boolean;
};

type PreparedGenerationInput =
  | { kind: 'diff'; diff: string; breakingChangeExpected: boolean }
  | { kind: 'summary'; summary: DiffSummary; breakingChangeExpected: boolean };

type ModelSelectionResult =
  | { kind: 'selected'; model: vscode.LanguageModelChat }
  | { kind: 'cancelled' }
  | { kind: 'noModels' };

const LANGUAGE_ENFORCEMENT_RULES: Record<CommitMessageLanguage, LanguageEnforcementRule> = {
  'zh-cn': {
    outputRequirement: 'Output MUST be Simplified Chinese (zh-CN).'
  },
  en: {
    outputRequirement: 'Output MUST be English.'
  }
};

function getCommitLanguage(): CommitMessageLanguage {
  const configured = vscode.workspace
    .getConfiguration('coding-plans')
    .get<string>('commitMessage.language', 'en');

  if (configured === 'zh-cn') {
    return 'zh-cn';
  }
  return 'en';
}

function shouldUseRecentCommitStyle(): boolean {
  return vscode.workspace
    .getConfiguration('coding-plans')
    .get<boolean>(COMMIT_MESSAGE_USE_RECENT_STYLE_SETTING_KEY, false);
}

function normalizePipelineMode(value: string | undefined): CommitMessagePipelineMode {
  if (value === 'single' || value === 'two-stage' || value === 'auto') {
    return value;
  }
  return DEFAULT_PIPELINE_MODE;
}

function getCommitMessageOptions(config: vscode.WorkspaceConfiguration): CommitMessageOptions {
  const configured = config.get<CommitMessageOptions | undefined>(COMMIT_MESSAGE_OPTIONS_SETTING_KEY, undefined);
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    return {};
  }
  return configured;
}

function readPositiveIntegerValue(value: unknown, fallback: number): number {
  const configured = value;
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(configured));
}

function getCommitMessageSettings(): CommitMessageSettings {
  const config = vscode.workspace.getConfiguration('coding-plans');
  const options = getCommitMessageOptions(config);
  const pipelineMode = normalizePipelineMode(
    typeof options[COMMIT_MESSAGE_OPTIONS_PIPELINE_MODE_KEY] === 'string'
      ? options[COMMIT_MESSAGE_OPTIONS_PIPELINE_MODE_KEY]
      : config.get<string>(LEGACY_COMMIT_MESSAGE_PIPELINE_MODE_SETTING_KEY, DEFAULT_PIPELINE_MODE)
  );

  return {
    pipelineMode,
    maxDiffLines: readPositiveIntegerValue(
      options[COMMIT_MESSAGE_OPTIONS_MAX_DIFF_LINES_KEY]
      ?? config.get<number>(LEGACY_COMMIT_MESSAGE_MAX_DIFF_LINES_SETTING_KEY, DEFAULT_COMMIT_MESSAGE_MAX_DIFF_LINES),
      DEFAULT_COMMIT_MESSAGE_MAX_DIFF_LINES
    ),
    summaryTriggerLines: readPositiveIntegerValue(
      options[COMMIT_MESSAGE_OPTIONS_SUMMARY_TRIGGER_LINES_KEY]
      ?? config.get<number>(LEGACY_COMMIT_MESSAGE_SUMMARY_TRIGGER_LINES_SETTING_KEY, DEFAULT_SUMMARY_TRIGGER_LINES),
      DEFAULT_SUMMARY_TRIGGER_LINES
    ),
    summaryChunkLines: readPositiveIntegerValue(
      options[COMMIT_MESSAGE_OPTIONS_SUMMARY_CHUNK_LINES_KEY]
      ?? config.get<number>(LEGACY_COMMIT_MESSAGE_SUMMARY_CHUNK_LINES_SETTING_KEY, DEFAULT_SUMMARY_CHUNK_LINES),
      DEFAULT_SUMMARY_CHUNK_LINES
    ),
    summaryMaxChunks: readPositiveIntegerValue(
      options[COMMIT_MESSAGE_OPTIONS_SUMMARY_MAX_CHUNKS_KEY]
      ?? config.get<number>(LEGACY_COMMIT_MESSAGE_SUMMARY_MAX_CHUNKS_SETTING_KEY, DEFAULT_SUMMARY_MAX_CHUNKS),
      DEFAULT_SUMMARY_MAX_CHUNKS
    ),
    bodyBulletCount: readPositiveIntegerValue(
      options[COMMIT_MESSAGE_OPTIONS_BODY_BULLET_COUNT_KEY]
      ?? config.get<number>(LEGACY_COMMIT_MESSAGE_BODY_BULLET_COUNT_SETTING_KEY, DEFAULT_BODY_BULLET_COUNT),
      DEFAULT_BODY_BULLET_COUNT
    ),
    subjectMaxLength: readPositiveIntegerValue(
      options[COMMIT_MESSAGE_OPTIONS_SUBJECT_MAX_LENGTH_KEY]
      ?? config.get<number>(LEGACY_COMMIT_MESSAGE_SUBJECT_MAX_LENGTH_SETTING_KEY, DEFAULT_SUBJECT_MAX_LENGTH),
      DEFAULT_SUBJECT_MAX_LENGTH
    ),
    requireConventionalType:
      typeof options[COMMIT_MESSAGE_OPTIONS_REQUIRE_CONVENTIONAL_TYPE_KEY] === 'boolean'
        ? options[COMMIT_MESSAGE_OPTIONS_REQUIRE_CONVENTIONAL_TYPE_KEY]
        : config.get<boolean>(
          LEGACY_COMMIT_MESSAGE_REQUIRE_CONVENTIONAL_TYPE_SETTING_KEY,
          DEFAULT_REQUIRE_CONVENTIONAL_TYPE
        ),
    warnOnValidationFailure:
      typeof options[COMMIT_MESSAGE_OPTIONS_WARN_ON_VALIDATION_FAILURE_KEY] === 'boolean'
        ? options[COMMIT_MESSAGE_OPTIONS_WARN_ON_VALIDATION_FAILURE_KEY]
        : config.get<boolean>(
          LEGACY_COMMIT_MESSAGE_WARN_ON_VALIDATION_FAILURE_SETTING_KEY,
          DEFAULT_WARN_ON_VALIDATION_FAILURE
        )
  };
}

function getCommitLanguageEnforcementBlock(language: CommitMessageLanguage): string {
  const rule = LANGUAGE_ENFORCEMENT_RULES[language];
  const forbiddenLanguageRule =
    language === 'zh-cn'
      ? 'Do not output English sentences.'
      : 'Do not output Chinese sentences.';
  const lines = [
    `LANGUAGE REQUIREMENT (HIGHEST PRIORITY): ${rule.outputRequirement}`,
    'If any other instruction conflicts with this language rule, ignore the conflicting instruction.',
    forbiddenLanguageRule
  ];

  return lines.join('\n');
}

function getCommitFormatPrompt(): string {
  const config = vscode.workspace.getConfiguration('coding-plans');
  const options = getCommitMessageOptions(config);
  const configured =
    typeof options[COMMIT_MESSAGE_OPTIONS_PROMPT_KEY] === 'string'
      ? options[COMMIT_MESSAGE_OPTIONS_PROMPT_KEY]
      : config.get<string>(LEGACY_COMMIT_MESSAGE_PROMPT_SETTING_KEY, DEFAULT_COMMIT_FORMAT_PROMPT);
  const trimmed = configured.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_COMMIT_FORMAT_PROMPT;
}

function getGenerationStructureBlock(settings: CommitMessageSettings, breakingChangeExpected: boolean): string {
  const lines = [
    'OUTPUT STRUCTURE (strict):',
    '1) First line MUST be the commit subject.',
    settings.requireConventionalType
      ? '2) Subject MUST follow Conventional Commits.'
      : '2) Subject SHOULD be concise and descriptive.',
    `3) Subject length SHOULD be <= ${settings.subjectMaxLength} characters.`,
    '4) Add one blank line after the subject.',
    `5) Then provide ${settings.bodyBulletCount} short bullet points, each prefixed with "- ".`,
    '6) Keep each bullet focused on concrete code changes.'
  ];

  if (breakingChangeExpected) {
    lines.push('7) Add a footer line: "BREAKING CHANGE: <impact summary>".');
  }

  lines.push('Do not include markdown code fences.');
  return lines.join('\n');
}

function buildDiffGenerationPrompt(
  diff: string,
  language: CommitMessageLanguage,
  settings: CommitMessageSettings,
  breakingChangeExpected: boolean,
  styleReferenceBlock?: string
): string {
  const languageEnforcementBlock = getCommitLanguageEnforcementBlock(language);
  const formatPrompt = getCommitFormatPrompt();
  const structureBlock = getGenerationStructureBlock(settings, breakingChangeExpected);

  const promptSections = [
    COMMIT_MESSAGE_TASK_BLOCK,
    '',
    languageEnforcementBlock,
    '',
    formatPrompt,
    '',
    structureBlock
  ];

  if (styleReferenceBlock) {
    promptSections.push('', styleReferenceBlock);
  }

  promptSections.push(
    '',
    '--- BEGIN DIFF ---',
    diff,
    '--- END DIFF ---'
  );
  return promptSections.join('\n');
}

function buildSummaryGenerationPrompt(
  summary: DiffSummary,
  language: CommitMessageLanguage,
  settings: CommitMessageSettings,
  styleReferenceBlock?: string
): string {
  const languageEnforcementBlock = getCommitLanguageEnforcementBlock(language);
  const formatPrompt = getCommitFormatPrompt();
  const structureBlock = getGenerationStructureBlock(settings, summary.breakingChange);

  const promptSections = [
    COMMIT_MESSAGE_TASK_BLOCK,
    '',
    languageEnforcementBlock,
    '',
    formatPrompt,
    '',
    structureBlock
  ];

  if (styleReferenceBlock) {
    promptSections.push('', styleReferenceBlock);
  }

  promptSections.push(
    '',
    'Use the following structured summary as the only source of truth.',
    '--- BEGIN CHANGE SUMMARY JSON ---',
    JSON.stringify(summary, null, 2),
    '--- END CHANGE SUMMARY JSON ---'
  );
  return promptSections.join('\n');
}

function buildChunkSummaryPrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
  return [
    'You are summarizing git diff chunks for commit-message generation.',
    'Return ONLY JSON. No markdown fences, no explanation.',
    'JSON schema:',
    SUMMARY_JSON_SCHEMA,
    '',
    `Chunk ${chunkIndex + 1} of ${totalChunks}.`,
    'Focus on concrete code changes, behavior changes, and risks.',
    '',
    '--- BEGIN DIFF CHUNK ---',
    chunk,
    '--- END DIFF CHUNK ---'
  ].join('\n');
}

function buildAggregateSummaryPrompt(chunkSummaries: DiffSummary[]): string {
  return [
    'You are aggregating chunk-level diff summaries.',
    'Return ONLY one JSON object with this schema:',
    SUMMARY_JSON_SCHEMA,
    '',
    'Rules:',
    '- Deduplicate files and repeated changes.',
    '- Keep majorChanges concise and actionable.',
    '- Set breakingChange=true only when the combined changes clearly indicate a breaking change.',
    '',
    '--- BEGIN CHUNK SUMMARIES JSON ---',
    JSON.stringify(chunkSummaries, null, 2),
    '--- END CHUNK SUMMARIES JSON ---'
  ].join('\n');
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function getRepositoryRootPath(repo: GitRepository): string | undefined {
  const rootPath = repo.rootUri?.fsPath?.trim();
  if (!rootPath) {
    return undefined;
  }
  return rootPath;
}

function trimCommitStyleSample(message: string): string {
  const normalized = normalizeNewlines(message).trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= RECENT_COMMIT_STYLE_MAX_ENTRY_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, RECENT_COMMIT_STYLE_MAX_ENTRY_LENGTH - 3)}...`;
}

async function getRecentCommitMessages(repo: GitRepository, count: number): Promise<string[]> {
  const rootPath = getRepositoryRootPath(repo);
  if (!rootPath) {
    return [];
  }

  const safeCount = Math.max(1, Math.floor(count));
  const stdout = await new Promise<string>((resolve) => {
    execFile(
      'git',
      ['-C', rootPath, 'log', `-${safeCount}`, `--pretty=format:%B${COMMIT_LOG_ENTRY_SEPARATOR}`],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, out) => {
        if (error) {
          resolve('');
          return;
        }
        resolve(out);
      }
    );
  });

  if (!stdout.trim()) {
    return [];
  }

  const messages = normalizeNewlines(stdout)
    .split(COMMIT_LOG_ENTRY_SEPARATOR)
    .map(trimCommitStyleSample)
    .filter(message => message.length > 0);

  let totalLength = 0;
  const limited: string[] = [];
  for (const message of messages) {
    if (totalLength + message.length > RECENT_COMMIT_STYLE_MAX_TOTAL_LENGTH) {
      break;
    }
    limited.push(message);
    totalLength += message.length;
  }

  return limited;
}

function buildStyleReferenceBlock(recentMessages: string[]): string | undefined {
  if (recentMessages.length === 0) {
    return undefined;
  }

  const examples = recentMessages
    .map((message, index) => `[${index + 1}]\n${message}`)
    .join('\n\n');

  return [
    'STYLE REFERENCE (optional):',
    'Mimic tone and structure from these recent commit messages.',
    'Do not copy exact change details, identifiers, or scopes unless required by the current diff.',
    '--- BEGIN RECENT COMMIT MESSAGES ---',
    examples,
    '--- END RECENT COMMIT MESSAGES ---'
  ].join('\n');
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0);
  return Array.from(new Set(normalized));
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  return false;
}

function toDiffSummary(value: unknown): DiffSummary {
  const objectValue = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    filesChanged: normalizeStringArray(objectValue.filesChanged),
    majorChanges: normalizeStringArray(objectValue.majorChanges),
    riskNotes: normalizeStringArray(objectValue.riskNotes),
    breakingChange: normalizeBoolean(objectValue.breakingChange)
  };
}

function extractFirstJsonObject(text: string): string | undefined {
  const normalized = stripMarkdownFences(text);
  const start = normalized.indexOf('{');
  if (start < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return normalized.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

function parseDiffSummary(raw: string): DiffSummary {
  const normalizedRaw = stripMarkdownFences(raw);
  try {
    return toDiffSummary(JSON.parse(normalizedRaw));
  } catch {
    const extracted = extractFirstJsonObject(normalizedRaw);
    if (!extracted) {
      throw new Error('Failed to parse summary JSON');
    }
    return toDiffSummary(JSON.parse(extracted));
  }
}

function splitDiffIntoChunks(diff: string, chunkLines: number, maxChunks: number): string[] {
  const normalizedDiff = normalizeNewlines(diff);
  const lines = normalizedDiff.split('\n');
  if (lines.length === 0) {
    return [];
  }

  const safeChunkLines = Math.max(1, chunkLines);
  const safeMaxChunks = Math.max(1, maxChunks);
  const chunks: string[] = [];
  let cursor = 0;

  for (let i = 0; i < safeMaxChunks && cursor < lines.length; i++) {
    if (i === safeMaxChunks - 1) {
      const remaining = lines.slice(cursor);
      if (cursor + safeChunkLines < lines.length) {
        remaining.unshift(
          '[NOTE] Remaining diff lines were merged into this final chunk because summaryMaxChunks was reached.',
          ''
        );
      }
      chunks.push(remaining.join('\n'));
      cursor = lines.length;
    } else {
      chunks.push(lines.slice(cursor, cursor + safeChunkLines).join('\n'));
      cursor += safeChunkLines;
    }
  }

  return chunks;
}

function shouldUseTwoStagePipeline(settings: CommitMessageSettings, diffLineCount: number): boolean {
  if (settings.pipelineMode === 'two-stage') {
    return true;
  }
  if (settings.pipelineMode === 'single') {
    return false;
  }
  return diffLineCount > settings.summaryTriggerLines;
}

function truncateDiffForSingleStage(diff: string, maxLines: number): { diff: string; originalLines: number; truncated: boolean } {
  const normalizedDiff = normalizeNewlines(diff);
  const lines = normalizedDiff.split('\n');
  if (lines.length <= maxLines) {
    return { diff: normalizedDiff, originalLines: lines.length, truncated: false };
  }
  return {
    diff: lines.slice(0, maxLines).join('\n'),
    originalLines: lines.length,
    truncated: true
  };
}

function sanitizeGeneratedCommitMessage(raw: string): string {
  const cleaned = stripMarkdownFences(normalizeNewlines(raw));
  const lines = cleaned.split('\n');
  const startIndex = lines.findIndex(line => line.trim().length > 0);
  if (startIndex < 0) {
    return '';
  }

  const subject = lines[startIndex].trim();
  const rest = lines.slice(startIndex + 1).map(line => line.trimEnd());
  while (rest.length > 0 && rest[rest.length - 1].trim().length === 0) {
    rest.pop();
  }

  if (rest.length === 0) {
    return subject;
  }
  if (rest[0].trim().length > 0) {
    rest.unshift('');
  }
  return [subject, ...rest].join('\n').trim();
}

function getBulletCount(message: string): number {
  return normalizeNewlines(message)
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .length;
}

function getSubjectLine(message: string): string {
  return normalizeNewlines(message).split('\n').find(line => line.trim().length > 0)?.trim() ?? '';
}

function validateCommitMessage(
  message: string,
  language: CommitMessageLanguage,
  settings: CommitMessageSettings,
  breakingChangeExpected: boolean
): string[] {
  const issues: string[] = [];
  const normalized = normalizeNewlines(message);
  const subject = getSubjectLine(normalized);

  if (!subject) {
    issues.push('subject line is empty');
    return issues;
  }

  if (settings.requireConventionalType && !CONVENTIONAL_COMMIT_SUBJECT_RE.test(subject)) {
    issues.push('subject does not follow Conventional Commits');
  }

  if (subject.length > settings.subjectMaxLength) {
    issues.push(`subject exceeds ${settings.subjectMaxLength} characters`);
  }

  if (language === 'en') {
    if (/[\u3400-\u9fff]/.test(normalized)) {
      issues.push('output contains Chinese characters but language is English');
    }
  } else {
    if (!/[\u3400-\u9fff]/.test(normalized)) {
      issues.push('output does not contain Simplified Chinese text');
    }
  }

  if (getBulletCount(normalized) < 2) {
    issues.push('body should contain at least 2 bullet lines');
  }

  if (breakingChangeExpected && !/^BREAKING CHANGE:/m.test(normalized)) {
    issues.push('missing BREAKING CHANGE footer for breaking changes');
  }

  return issues;
}

async function getGitRepository(): Promise<GitRepository | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    return undefined;
  }

  const gitApi = ext.isActive ? ext.exports.getAPI(1) : (await ext.activate()).getAPI(1);
  return gitApi.repositories[0];
}

async function getDiff(repo: GitRepository): Promise<string> {
  const staged = await repo.diff(true);
  if (staged.trim().length > 0) {
    return staged;
  }
  return repo.diff(false);
}

function isPlaceholderModelId(modelId: string): boolean {
  return PLACEHOLDER_MODEL_ID_SUFFIXES.some(suffix => modelId.endsWith(suffix));
}

function isCopilotVendor(vendor: string): boolean {
  return normalizeValue(vendor) === 'copilot';
}

function modelSortKey(model: vscode.LanguageModelChat): [number, string, string, string, string] {
  // Prefer this extension's vendors first, then other vendors.
  const tier = model.vendor === CODING_PLANS_VENDOR ? 0 : 1;
  return [tier, model.vendor, model.family, model.name, model.id];
}

function getVendorDisplayName(vendor: string): string {
  switch (vendor) {
    case 'coding-plans':
      return 'Coding Plans';
    default:
      return vendor;
  }
}

function normalizeValue(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function getCodingPlansVendorName(model: vscode.LanguageModelChat): string | undefined {
  if (model.vendor !== CODING_PLANS_VENDOR) {
    return undefined;
  }
  const slashIndex = model.id.indexOf('/');
  if (slashIndex <= 0) {
    return undefined;
  }
  return model.id.substring(0, slashIndex);
}

function matchesCodingPlansVendor(model: vscode.LanguageModelChat, vendor: string): boolean {
  const normalizedVendor = normalizeValue(vendor);
  if (!normalizedVendor || model.vendor !== CODING_PLANS_VENDOR) {
    return false;
  }

  const familyMatch = normalizeValue(model.family) === normalizedVendor;
  if (familyMatch) {
    return true;
  }

  const vendorFromId = getCodingPlansVendorName(model);
  return normalizeValue(vendorFromId) === normalizedVendor;
}

function matchesCodingPlansSelection(model: vscode.LanguageModelChat, vendor: string, id?: string): boolean {
  if (!matchesCodingPlansVendor(model, vendor)) {
    return false;
  }
  if (!id) {
    return true;
  }

  const normalizedId = normalizeValue(id);
  if (normalizeValue(model.name) === normalizedId) {
    return true;
  }

  const slashIndex = model.id.indexOf('/');
  const idFromComposite = slashIndex >= 0 ? model.id.substring(slashIndex + 1) : model.id;
  return normalizeValue(idFromComposite) === normalizedId;
}

function isDistinctDisplayValue(value: string | undefined, ...others: Array<string | undefined>): boolean {
  const target = normalizeValue(value);
  if (!target) {
    return false;
  }
  return others.every(other => normalizeValue(other) !== target);
}

function toVendorScopedModelQuickPickItem(model: vscode.LanguageModelChat): {
  label: string;
  description?: string;
  detail?: string;
  model: vscode.LanguageModelChat;
} {
  const description = isDistinctDisplayValue(model.family, model.name) ? model.family : undefined;
  const detail = isDistinctDisplayValue(model.id, model.name, model.family) ? model.id : undefined;
  return {
    label: model.name,
    description,
    detail,
    model
  };
}

function getModelVendorLabel(model: vscode.LanguageModelChat): string {
  if (model.vendor === CODING_PLANS_VENDOR) {
    return model.family || 'Coding Plans';
  }
  return getVendorDisplayName(model.vendor);
}

function getModelGroupKey(model: vscode.LanguageModelChat): string {
  if (model.vendor === CODING_PLANS_VENDOR) {
    return model.family || model.vendor;
  }
  return model.vendor;
}

function toGlobalModelQuickPickItem(model: vscode.LanguageModelChat): {
  label: string;
  description?: string;
  detail?: string;
  model: vscode.LanguageModelChat;
} {
  const descriptionParts = [getModelVendorLabel(model)];
  if (isDistinctDisplayValue(model.family, model.name) && model.family !== descriptionParts[0]) {
    descriptionParts.push(model.family);
  }
  const detail = isDistinctDisplayValue(model.id, model.name, model.family) ? model.id : undefined;
  return {
    label: model.name,
    description: descriptionParts.join(' · '),
    detail,
    model
  };
}

async function pickVendor(models: vscode.LanguageModelChat[]): Promise<string | undefined> {
  type VendorEntry = { key: string; displayName: string; count: number };
  const vendorMap = new Map<string, VendorEntry>();

  for (const model of models) {
    const key = getModelGroupKey(model);
    const existing = vendorMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      vendorMap.set(key, { key, displayName: getModelVendorLabel(model), count: 1 });
    }
  }

  const vendors = Array.from(vendorMap.values());
  const picked = await vscode.window.showQuickPick(
    vendors.map(item => ({
      label: item.displayName,
      description: item.key !== item.displayName ? item.key : undefined,
      detail: `${item.count} model${item.count > 1 ? 's' : ''}`,
      vendor: item.key
    })),
    {
      ignoreFocusOut: true,
      placeHolder: getMessage('commitMessageSelectVendor')
    }
  );

  return picked?.vendor;
}

function getCommitMessageConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('coding-plans');
}

function readConfiguredModelSelector(): { vendor?: string; id?: string } {
  const config = getCommitMessageConfig();
  const vendor = (config.get<string>(COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY, '') || '').trim();
  const id = (config.get<string>(COMMIT_MESSAGE_MODEL_ID_SETTING_KEY, '') || '').trim();
  return {
    vendor: vendor.length > 0 ? vendor : undefined,
    id: id.length > 0 ? id : undefined
  };
}

async function saveModelSelection(model: vscode.LanguageModelChat): Promise<void> {
  const config = getCommitMessageConfig();
  let vendorToSave = model.vendor;
  let idToSave = model.id;

  if (model.vendor === CODING_PLANS_VENDOR && model.id.includes('/')) {
    const slashIndex = model.id.indexOf('/');
    vendorToSave = model.id.substring(0, slashIndex);
    idToSave = model.id.substring(slashIndex + 1);
  }

  await Promise.all([
    config.update(COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY, vendorToSave, vscode.ConfigurationTarget.Global),
    config.update(COMMIT_MESSAGE_MODEL_ID_SETTING_KEY, idToSave, vscode.ConfigurationTarget.Global)
  ]);
}

async function selectModel(
  allowPrompt: boolean,
  forcePrompt = false
): Promise<ModelSelectionResult> {
  const allModels = await vscode.lm.selectChatModels();
  const models = allModels
    .filter(model => !isPlaceholderModelId(model.id) && !isCopilotVendor(model.vendor))
    .sort((a, b) => {
      const ka = modelSortKey(a);
      const kb = modelSortKey(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) { return -1; }
        if (ka[i] > kb[i]) { return 1; }
      }
      return 0;
    });

  if (models.length === 0) {
    return { kind: 'noModels' };
  }

  const selector = readConfiguredModelSelector();

  if (!forcePrompt) {
    if (selector.vendor && selector.id) {
      const vendor = selector.vendor;
      const id = selector.id;
      const compositeId = `${vendor}/${id}`;
      const match = models.find(m =>
        (m.vendor === CODING_PLANS_VENDOR && (m.id === compositeId || matchesCodingPlansSelection(m, vendor, id)))
        || (m.vendor === vendor && m.id === id)
      );
      if (match) {
        return { kind: 'selected', model: match };
      }
      if (allowPrompt) {
        void vscode.window.showWarningMessage(getMessage('commitMessageConfiguredModelNotFound'));
      }
    } else if (selector.vendor) {
      const vendor = selector.vendor;
      const match = models.find(m =>
        (m.vendor === CODING_PLANS_VENDOR && matchesCodingPlansSelection(m, vendor))
        || (m.vendor === vendor)
      );
      if (match) {
        return { kind: 'selected', model: match };
      }
      if (allowPrompt) {
        void vscode.window.showWarningMessage(getMessage('commitMessageConfiguredVendorNotFound', selector.vendor));
      }
    }
  }

  if (!allowPrompt) {
    return { kind: 'selected', model: models[0] };
  }

  if (!selector.vendor) {
    const pickedVendor = await pickVendor(models);
    if (!pickedVendor) {
      return { kind: 'cancelled' };
    }

    const vendorModels = models.filter(model => getModelGroupKey(model) === pickedVendor);
    const pickedModel = await vscode.window.showQuickPick(
      vendorModels.map(model => toVendorScopedModelQuickPickItem(model)),
      {
        ignoreFocusOut: true,
        placeHolder: getMessage('commitMessageSelectModelForVendor', pickedVendor)
      }
    );

    if (!pickedModel) {
      return { kind: 'cancelled' };
    }

    await saveModelSelection(pickedModel.model);
    return { kind: 'selected', model: pickedModel.model };
  }

  if (models.length === 1) {
    await saveModelSelection(models[0]);
    return { kind: 'selected', model: models[0] };
  }

  const picked = await vscode.window.showQuickPick(
    models.map(model => toGlobalModelQuickPickItem(model)),
    {
      ignoreFocusOut: true,
      placeHolder: getMessage('commitMessageSelectModel')
    }
  );

  if (!picked) {
    return { kind: 'cancelled' };
  }

  await saveModelSelection(picked.model);
  return { kind: 'selected', model: picked.model };
}

function isLanguageModelBlockedError(error: unknown): boolean {
  if (error instanceof vscode.LanguageModelError) {
    return error.code === vscode.LanguageModelError.Blocked.name;
  }
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && code === vscode.LanguageModelError.Blocked.name;
}

async function sendPrompt(
  model: vscode.LanguageModelChat,
  prompt: string,
  token: vscode.CancellationToken,
  justification: string
): Promise<string> {
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  let response: vscode.LanguageModelChatResponse;
  try {
    response = await model.sendRequest(messages, { justification }, token);
  } catch (error: unknown) {
    if (isLanguageModelBlockedError(error) && isCopilotVendor(model.vendor)) {
      throw new Error(getMessage('commitMessageCopilotQuotaExceeded'));
    }
    throw error;
  }

  let result = '';
  for await (const chunk of response.text) {
    result += chunk;
  }
  return result.trim();
}

async function runTwoStageSummary(
  model: vscode.LanguageModelChat,
  diff: string,
  settings: CommitMessageSettings,
  token: vscode.CancellationToken
): Promise<DiffSummary> {
  const chunks = splitDiffIntoChunks(diff, settings.summaryChunkLines, settings.summaryMaxChunks);
  if (chunks.length === 0) {
    return {
      filesChanged: [],
      majorChanges: [],
      riskNotes: [],
      breakingChange: false
    };
  }

  const chunkSummaries: DiffSummary[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const rawChunkSummary = await sendPrompt(
      model,
      buildChunkSummaryPrompt(chunks[i], i, chunks.length),
      token,
      'Summarize a diff chunk for commit message generation.'
    );
    chunkSummaries.push(parseDiffSummary(rawChunkSummary));
  }

  const rawAggregateSummary = await sendPrompt(
    model,
    buildAggregateSummaryPrompt(chunkSummaries),
    token,
    'Aggregate chunk summaries into one structured summary.'
  );
  return parseDiffSummary(rawAggregateSummary);
}

async function prepareGenerationInput(
  model: vscode.LanguageModelChat,
  diff: string,
  settings: CommitMessageSettings,
  token: vscode.CancellationToken
): Promise<PreparedGenerationInput> {
  const diffLineCount = normalizeNewlines(diff).split('\n').length;
  const useTwoStage = shouldUseTwoStagePipeline(settings, diffLineCount);

  if (useTwoStage) {
    try {
      const summary = await runTwoStageSummary(model, diff, settings, token);
      return {
        kind: 'summary',
        summary,
        breakingChangeExpected: summary.breakingChange
      };
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(getMessage('commitMessageSummaryFallback', detail));
      const truncated = truncateDiffForSingleStage(diff, settings.maxDiffLines);
      if (truncated.truncated) {
        void vscode.window.showWarningMessage(
          getMessage('commitMessageDiffTooLarge', truncated.originalLines, settings.maxDiffLines)
        );
      }
      return {
        kind: 'diff',
        diff: truncated.diff,
        breakingChangeExpected: false
      };
    }
  }

  const truncated = truncateDiffForSingleStage(diff, settings.maxDiffLines);
  if (truncated.truncated) {
    void vscode.window.showWarningMessage(
      getMessage('commitMessageDiffTooLarge', truncated.originalLines, settings.maxDiffLines)
    );
  }
  return {
    kind: 'diff',
    diff: truncated.diff,
    breakingChangeExpected: false
  };
}

function maybeWarnOnValidationFailure(
  generatedMessage: string,
  language: CommitMessageLanguage,
  settings: CommitMessageSettings,
  breakingChangeExpected: boolean
): void {
  if (!settings.warnOnValidationFailure) {
    return;
  }
  const issues = validateCommitMessage(generatedMessage, language, settings, breakingChangeExpected);
  if (issues.length === 0) {
    return;
  }
  void vscode.window.showWarningMessage(
    getMessage('commitMessageValidationWarning', issues.join('; '))
  );
}

function getCommitMessagePreview(message: string): string {
  return getSubjectLine(message);
}

export async function selectCommitMessageModel(): Promise<void> {
  const selection = await selectModel(true, true);
  if (selection.kind === 'cancelled') {
    vscode.window.showInformationMessage(getMessage('requestCancelled'));
    return;
  }
  if (selection.kind === 'noModels') {
    vscode.window.showWarningMessage(getMessage('commitMessageNoModel'));
    return;
  }
  vscode.window.showInformationMessage(
    getMessage('commitMessageModelSaved', `${selection.model.vendor} · ${selection.model.name}`)
  );
}

export async function generateCommitMessage(): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.SourceControl,
        title: getMessage('commitMessageGenerating')
      },
      async (progress, token) => {
        // Yield once so progress UI can render immediately after button click.
        progress.report({ message: getMessage('commitMessageProgressCheckingRepo'), increment: 1 });
        await Promise.resolve();

        const repo = await getGitRepository();
        if (!repo) {
          vscode.window.showWarningMessage(getMessage('commitMessageNoGitRepo'));
          return;
        }

        progress.report({ message: getMessage('commitMessageProgressReadingDiff'), increment: 9 });
        const diff = await getDiff(repo);
        if (diff.trim().length === 0) {
          vscode.window.showInformationMessage(getMessage('commitMessageNoChanges'));
          return;
        }

        progress.report({ message: getMessage('commitMessageProgressSelectingModel'), increment: 10 });
        const selection = await selectModel(true);
        if (selection.kind === 'cancelled') {
          vscode.window.showInformationMessage(getMessage('requestCancelled'));
          return;
        }
        if (selection.kind === 'noModels') {
          vscode.window.showWarningMessage(getMessage('commitMessageNoModel'));
          return;
        }

        const model = selection.model;
        const settings = getCommitMessageSettings();
        const language = getCommitLanguage();
        const styleReferenceBlockPromise = shouldUseRecentCommitStyle()
          ? getRecentCommitMessages(repo, DEFAULT_RECENT_COMMIT_STYLE_SAMPLE_SIZE).then(buildStyleReferenceBlock)
          : Promise.resolve<string | undefined>(undefined);

        progress.report({ message: getMessage('commitMessageProgressPreparing'), increment: 20 });
        const preparedInput = await prepareGenerationInput(model, diff, settings, token);
        const styleReferenceBlock = await styleReferenceBlockPromise;
        progress.report({
          increment: 20,
          message:
            preparedInput.kind === 'summary'
              ? getMessage('commitMessageProgressGeneratingFromSummary')
              : getMessage('commitMessageProgressGeneratingFromDiff')
        });
        const prompt =
          preparedInput.kind === 'summary'
            ? buildSummaryGenerationPrompt(preparedInput.summary, language, settings, styleReferenceBlock)
            : buildDiffGenerationPrompt(
              preparedInput.diff,
              language,
              settings,
              preparedInput.breakingChangeExpected,
              styleReferenceBlock
            );

        const rawResult = await sendPrompt(
          model,
          prompt,
          token,
          'Generate a git commit message from code changes.'
        );

        const normalizedMessage = sanitizeGeneratedCommitMessage(rawResult);
        if (!normalizedMessage) {
          throw new Error('Empty commit message generated');
        }

        maybeWarnOnValidationFailure(
          normalizedMessage,
          language,
          settings,
          preparedInput.breakingChangeExpected
        );

        repo.inputBox.value = normalizedMessage;
        progress.report({ increment: 40 });
        vscode.window.showInformationMessage(
          getMessage('commitMessageGenerated', getCommitMessagePreview(normalizedMessage))
        );
      }
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(getMessage('commitMessageFailed', detail));
  }
}
