import type { Key } from '../i18n.js';
import { enReviews } from './en/reviews.js';
import { enShell } from './en/shell.js';
import { enTasks } from './en/tasks.js';
import { enSessions } from './en/sessions.js';
import { enAutomation } from './en/automation.js';
import { enObserve } from './en/observe.js';
import { enTerminals } from './en/terminals.js';
import { enConnect } from './en/connect.js';
import { enCommon } from './en/common.js';
import { enAgents } from './en/agents.js';
import { enMessages } from './en/messages.js';
import { enOffice } from './en/office.js';
import { enMachines } from './en/machines.js';
import { enKnowledge } from './en/knowledge.js';
import { enTelemetry } from './en/telemetry.js';
import { enGit } from './en/git.js';
import { enKpi } from './en/kpi.js';
import { enClockout } from './en/clockout.js';
import { enModels } from './en/models.js';
import { enFeed } from './en/feed.js';
import { enApprovals } from './en/approvals.js';
import { enComposer } from './en/composer.js';
import { enCharacter } from './en/character.js';
import { enErrors } from './en/errors.js';
import { settingsEn } from './settings-en.js';
import { squadEn } from './squad-en.js';

export const en: Record<Key, string> = {
  ...enReviews,
  ...enShell,
  ...enTasks,
  ...enSessions,
  ...enAutomation,
  ...enObserve,
  ...enTerminals,
  ...enConnect,
  ...enCommon,
  ...enAgents,
  ...enMessages,
  ...enOffice,
  ...enMachines,
  ...enKnowledge,
  ...enTelemetry,
  ...enGit,
  ...enKpi,
  ...enClockout,
  ...enModels,
  ...enFeed,
  ...enApprovals,
  ...enComposer,
  ...enCharacter,
  ...enErrors,
  ...settingsEn,
  ...squadEn,
};
