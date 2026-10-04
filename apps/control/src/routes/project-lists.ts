import { listConnections } from '../services/integrations.js';
import { listMeetings } from '../services/meetings.js';
import { listObservations } from '../services/observations.js';
import { listReservations } from '../services/reservations.js';
import { listRooms } from '../services/rooms.js';
import { listSchedules } from '../services/schedules.js';
import { listSkills } from '../services/skills.js';
import { listTerminals, readTerminal } from '../services/terminals.js';
import { listWorkflows } from '../services/workflows.js';
import { CAPABILITIES, authorize } from '@aether/kernel';
import type { RouteContext } from './context.js';

/** Read-only lists a project page shows: terminals, reservations, schedules, skills, rooms, workflows, meetings, observations. */
export function projectListRoutes({ app, control, actor }: RouteContext) {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/terminals',
    async (request) => listTerminals(control.ctx, actor(request), request.params.projectId),
  );
  app.get<{ Params: { projectId: string; terminalId: string } }>(
    '/api/projects/:projectId/terminals/:terminalId',
    async (request) =>
      readTerminal(
        control.ctx,
        actor(request),
        request.params.projectId,
        request.params.terminalId,
      ),
  );
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/reservations',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      return { reservations: listReservations(control.ctx, request.params.projectId) };
    },
  );
  // Static adapter matrix: lets the UI disable what a provider cannot do instead of guessing.
  app.get('/api/capabilities', async (request) => {
    authorize(actor(request), 'read');
    return { providers: CAPABILITIES };
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/schedules',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      return { schedules: listSchedules(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/skills', async (request) => {
    const who = actor(request);
    authorize(who, 'read', request.params.projectId);
    return { skills: listSkills(control.ctx, who, request.params.projectId) };
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/integrations',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      return { integrations: listConnections(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/rooms', async (request) => {
    const who = actor(request);
    authorize(who, 'read', request.params.projectId);
    // Agents see only the rooms they belong to.
    const rooms = listRooms(control.ctx, request.params.projectId);
    return {
      rooms: who.agentId ? rooms.filter((r) => r.members.includes(who.agentId!)) : rooms,
    };
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/workflows',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      return { workflows: listWorkflows(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/meetings',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      // Agents learn of a meeting through the request they were sent, not from this list.
      if (who.agentId) return { meetings: [] };
      return { meetings: listMeetings(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string }; Querystring: { before?: string } }>(
    '/api/projects/:projectId/observations',
    async (request) =>
      listObservations(
        control.ctx,
        actor(request),
        request.params.projectId,
        request.query.before === undefined ? undefined : Number(request.query.before),
      ),
  );
}
