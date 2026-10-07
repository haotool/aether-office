import { zhShell } from './zh/shell.js';
import { zhTasks } from './zh/tasks.js';
import { zhSessions } from './zh/sessions.js';
import { zhAutomation } from './zh/automation.js';
import { zhObserve } from './zh/observe.js';
import { zhTerminals } from './zh/terminals.js';
import { zhConnect } from './zh/connect.js';
import { zhCommon } from './zh/common.js';
import { zhAgents } from './zh/agents.js';
import { zhReviews } from './zh/reviews.js';
import { zhMessages } from './zh/messages.js';
import { zhOffice } from './zh/office.js';
import { zhMachines } from './zh/machines.js';
import { zhKnowledge } from './zh/knowledge.js';
import { zhTelemetry } from './zh/telemetry.js';
import { zhGit } from './zh/git.js';
import { zhKpi } from './zh/kpi.js';
import { zhClockout } from './zh/clockout.js';
import { zhModels } from './zh/models.js';
import { zhFeed } from './zh/feed.js';
import { zhApprovals } from './zh/approvals.js';
import { zhComposer } from './zh/composer.js';
import { zhCharacter } from './zh/character.js';
import { zhErrors } from './zh/errors.js';
import { settingsZh } from './settings-zh.js';
import { squadZh } from './squad-zh.js';

export const zh = {
  ...zhShell,
  ...zhTasks,
  ...zhSessions,
  ...zhAutomation,
  ...zhObserve,
  ...zhTerminals,
  ...zhConnect,
  ...zhCommon,
  ...zhAgents,
  ...zhReviews,
  ...zhMessages,
  ...zhOffice,
  ...zhMachines,
  ...zhKnowledge,
  ...zhTelemetry,
  ...zhGit,
  ...zhKpi,
  ...zhClockout,
  ...zhModels,
  ...zhFeed,
  ...zhApprovals,
  ...zhComposer,
  ...zhCharacter,
  ...zhErrors,
  ...settingsZh,
  ...squadZh,
} as const;
