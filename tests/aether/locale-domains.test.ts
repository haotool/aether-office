import { describe, expect, it } from 'vitest';
import { enAgents } from '../../apps/web/src/locales/en/agents.js';
import { zhAgents } from '../../apps/web/src/locales/zh/agents.js';
import { enApprovals } from '../../apps/web/src/locales/en/approvals.js';
import { zhApprovals } from '../../apps/web/src/locales/zh/approvals.js';
import { enAutomation } from '../../apps/web/src/locales/en/automation.js';
import { zhAutomation } from '../../apps/web/src/locales/zh/automation.js';
import { enCharacter } from '../../apps/web/src/locales/en/character.js';
import { zhCharacter } from '../../apps/web/src/locales/zh/character.js';
import { enClockout } from '../../apps/web/src/locales/en/clockout.js';
import { zhClockout } from '../../apps/web/src/locales/zh/clockout.js';
import { enCommon } from '../../apps/web/src/locales/en/common.js';
import { zhCommon } from '../../apps/web/src/locales/zh/common.js';
import { enComposer } from '../../apps/web/src/locales/en/composer.js';
import { zhComposer } from '../../apps/web/src/locales/zh/composer.js';
import { enConnect } from '../../apps/web/src/locales/en/connect.js';
import { zhConnect } from '../../apps/web/src/locales/zh/connect.js';
import { enErrors } from '../../apps/web/src/locales/en/errors.js';
import { zhErrors } from '../../apps/web/src/locales/zh/errors.js';
import { enFeed } from '../../apps/web/src/locales/en/feed.js';
import { zhFeed } from '../../apps/web/src/locales/zh/feed.js';
import { enGit } from '../../apps/web/src/locales/en/git.js';
import { zhGit } from '../../apps/web/src/locales/zh/git.js';
import { enKnowledge } from '../../apps/web/src/locales/en/knowledge.js';
import { zhKnowledge } from '../../apps/web/src/locales/zh/knowledge.js';
import { enKpi } from '../../apps/web/src/locales/en/kpi.js';
import { zhKpi } from '../../apps/web/src/locales/zh/kpi.js';
import { enMachines } from '../../apps/web/src/locales/en/machines.js';
import { zhMachines } from '../../apps/web/src/locales/zh/machines.js';
import { enMessages } from '../../apps/web/src/locales/en/messages.js';
import { zhMessages } from '../../apps/web/src/locales/zh/messages.js';
import { enModels } from '../../apps/web/src/locales/en/models.js';
import { zhModels } from '../../apps/web/src/locales/zh/models.js';
import { enObserve } from '../../apps/web/src/locales/en/observe.js';
import { zhObserve } from '../../apps/web/src/locales/zh/observe.js';
import { enOffice } from '../../apps/web/src/locales/en/office.js';
import { zhOffice } from '../../apps/web/src/locales/zh/office.js';
import { enReviews } from '../../apps/web/src/locales/en/reviews.js';
import { zhReviews } from '../../apps/web/src/locales/zh/reviews.js';
import { enSessions } from '../../apps/web/src/locales/en/sessions.js';
import { zhSessions } from '../../apps/web/src/locales/zh/sessions.js';
import { enShell } from '../../apps/web/src/locales/en/shell.js';
import { zhShell } from '../../apps/web/src/locales/zh/shell.js';
import { enTasks } from '../../apps/web/src/locales/en/tasks.js';
import { zhTasks } from '../../apps/web/src/locales/zh/tasks.js';
import { enTelemetry } from '../../apps/web/src/locales/en/telemetry.js';
import { zhTelemetry } from '../../apps/web/src/locales/zh/telemetry.js';
import { enTerminals } from '../../apps/web/src/locales/en/terminals.js';
import { zhTerminals } from '../../apps/web/src/locales/zh/terminals.js';
import { settingsEn } from '../../apps/web/src/locales/settings-en.js';
import { settingsZh } from '../../apps/web/src/locales/settings-zh.js';
import { squadEn } from '../../apps/web/src/locales/squad-en.js';
import { squadZh } from '../../apps/web/src/locales/squad-zh.js';
import { en } from '../../apps/web/src/locales/en.js';
import { zh } from '../../apps/web/src/locales/zh.js';

const DOMAINS: [string, object, object][] = [
  ['agents', enAgents, zhAgents],
  ['approvals', enApprovals, zhApprovals],
  ['automation', enAutomation, zhAutomation],
  ['character', enCharacter, zhCharacter],
  ['clockout', enClockout, zhClockout],
  ['common', enCommon, zhCommon],
  ['composer', enComposer, zhComposer],
  ['connect', enConnect, zhConnect],
  ['errors', enErrors, zhErrors],
  ['feed', enFeed, zhFeed],
  ['git', enGit, zhGit],
  ['knowledge', enKnowledge, zhKnowledge],
  ['kpi', enKpi, zhKpi],
  ['machines', enMachines, zhMachines],
  ['messages', enMessages, zhMessages],
  ['models', enModels, zhModels],
  ['observe', enObserve, zhObserve],
  ['office', enOffice, zhOffice],
  ['reviews', enReviews, zhReviews],
  ['sessions', enSessions, zhSessions],
  ['shell', enShell, zhShell],
  ['tasks', enTasks, zhTasks],
  ['telemetry', enTelemetry, zhTelemetry],
  ['terminals', enTerminals, zhTerminals],
  ['settings (page tables)', settingsEn, settingsZh],
  ['squad (page tables)', squadEn, squadZh],
];

describe.each(DOMAINS)('locale domain %s', (_name, english, chinese) => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort());
  });
  it('has no empty text', () => {
    for (const text of [...Object.values(english), ...Object.values(chinese)])
      expect(text).not.toBe('');
  });
});

describe('composed locale tables', () => {
  it('keep every key in exactly one domain module', () => {
    const all = DOMAINS.flatMap(([, english]) => Object.keys(english));
    expect(new Set(all).size).toBe(all.length);
  });
  it('are the union of the domain modules', () => {
    const all = DOMAINS.flatMap(([, english]) => Object.keys(english)).sort();
    expect(Object.keys(en).sort()).toEqual(all);
    expect(Object.keys(zh).sort()).toEqual(all);
  });
});
