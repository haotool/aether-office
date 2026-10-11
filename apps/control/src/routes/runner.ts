import { approvalSent, pollApproval, requestApproval } from '../services/permissions/approvals.js';
import { redeemInvitation } from '../services/remote/invitations.js';
import { claimJob, reportJob } from '../services/work/jobs.js';
import { reportObservation } from '../services/domain/observations.js';
import {
  claim,
  enroll,
  heartbeat,
  report,
  sessionCredential,
} from '../services/runtime/runners.js';
import {
  claimTerminalCommand,
  reportTerminalCommand,
  reportTerminalSnapshot,
} from '../services/platform/terminals.js';
import { terminalProfileSchema, verifierSchema } from '@aether/contracts';
import { DomainError } from '@aether/kernel';
import { z } from 'zod';
import type { RouteContext } from './context.js';

export function runnerRoutes(context: RouteContext) {
  machineRoutes(context);
  enrollRoute(context);
  runnerWorkRoutes(context);
  runnerApprovalRoutes(context);
}

function machineRoutes({ app, control, actor }: RouteContext) {
  app.post('/api/machines', async (request) => {
    const body = z
      .strictObject({
        name: z.string().min(1).max(160),
        projectIds: z.array(z.string().uuid()).min(1).max(32),
        concurrency: z.number().int().min(1).max(4).default(2),
      })
      .parse(request.body);
    const enrolled = enroll(
      control.ctx,
      actor(request),
      body.name,
      body.projectIds,
      body.concurrency,
    );
    return { machineId: enrolled.machineId, token: enrolled.token };
  });
  app.post('/api/runner/heartbeat', async (request) => {
    const body = z
      .strictObject({
        verifiers: z.array(verifierSchema).max(20).optional(),
        terminalProfiles: z.array(terminalProfileSchema).max(20).optional(),
      })
      .parse(request.body);
    return heartbeat(control.ctx, actor(request), body.verifiers, body.terminalProfiles);
  });
}

// Unauthenticated by design: the single-use invitation token is the credential. Rate limited by IP.
function enrollRoute({ app, control, attempts }: RouteContext) {
  app.post('/api/runner/enroll', async (request) => {
    const key = `enroll:${request.ip}`;
    const now = control.ctx.now();
    const last = attempts.get(key);
    if (last && last.until > now && last.count >= 10)
      throw new DomainError('ENROLL_RATE_LIMIT', 429);
    const { invitation } = z
      .strictObject({ invitation: z.string().min(10).max(200) })
      .parse(request.body);
    try {
      return redeemInvitation(control.ctx, invitation);
    } catch (error) {
      attempts.set(key, {
        count: (last && last.until > now ? last.count : 0) + 1,
        until: now + 60_000,
      });
      throw error;
    }
  });
}

function runnerWorkRoutes({ app, control, actor }: RouteContext) {
  app.post('/api/runner/observations', async (request) =>
    reportObservation(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/terminals/claim', async (request) => ({
    command: claimTerminalCommand(control.ctx, actor(request)),
  }));
  app.post('/api/runner/terminals/result', async (request) =>
    reportTerminalCommand(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/terminals/snapshot', async (request) =>
    reportTerminalSnapshot(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/jobs/claim', async (request) => ({
    job: claimJob(control.ctx, actor(request)),
  }));
  app.post('/api/runner/jobs/report', async (request) =>
    reportJob(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/claim', async (request) => {
    const body = z
      .strictObject({
        providers: z
          .array(z.enum(['demo', 'claude', 'codex', 'acp']))
          .min(1)
          .max(4),
      })
      .parse(request.body);
    return { command: claim(control.ctx, actor(request), body.providers) };
  });
  app.post('/api/runner/session-credential', async (request) => {
    const data = z
      .strictObject({ runId: z.string().uuid(), epoch: z.number().int().positive() })
      .parse(request.body);
    return sessionCredential(control.ctx, actor(request), data.runId, data.epoch);
  });
  app.post('/api/runner/report', async (request) =>
    report(control.ctx, actor(request), request.body),
  );
}

function runnerApprovalRoutes({ app, control, actor }: RouteContext) {
  app.post('/api/runner/approvals/request', async (request) =>
    requestApproval(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/approvals/poll', async (request) => {
    const body = z
      .strictObject({ runId: z.string().uuid(), approvalId: z.string().uuid() })
      .parse(request.body);
    return pollApproval(control.ctx, actor(request), body.runId, body.approvalId);
  });
  app.post('/api/runner/approvals/sent', async (request) => {
    const body = z
      .strictObject({ runId: z.string().uuid(), requestId: z.string().min(1).max(200) })
      .parse(request.body);
    return approvalSent(control.ctx, actor(request), body.runId, body.requestId);
  });
}
