// Verified provider capabilities. A flag is true only when the adapter implements it and a test
// exercises it; everything else stays false so the platform refuses and the UI disables the control.
export type Injection = 'mid_turn' | 'turn_boundary' | 'none';
export type Capabilities = {
  start: boolean;
  resume: boolean;
  interrupt: boolean;
  terminate: boolean;
  fork: boolean;
  structuredEvents: boolean;
  toolEvents: boolean;
  permissionRequests: boolean;
  subagents: boolean;
  usage: boolean;
  ptyAttach: boolean;
  externalObservation: boolean;
  messageInjection: Injection;
};
export type CapabilityFlag = Exclude<keyof Capabilities, 'messageInjection'>;

const none: Capabilities = {
  start: false,
  resume: false,
  interrupt: false,
  terminate: false,
  fork: false,
  structuredEvents: false,
  toolEvents: false,
  permissionRequests: false,
  subagents: false,
  usage: false,
  ptyAttach: false,
  externalObservation: false,
  messageInjection: 'none',
};

// Subagents are disabled in both native adapters; fork and message injection are not implemented.
export const CAPABILITIES = {
  demo: { ...none, start: true, interrupt: true, terminate: true, structuredEvents: true },
  codex: {
    ...none,
    start: true,
    resume: true,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: true,
    permissionRequests: true,
    usage: true,
    externalObservation: true,
  },
  claude: {
    ...none,
    start: true,
    resume: true,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: true,
    permissionRequests: true,
    usage: true,
    externalObservation: true,
  },
  // Generic ACP agent: static floor only. resume, images and MCP depend on negotiation per agent.
  acp: {
    ...none,
    start: true,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: true,
    permissionRequests: true,
  },
  observe: { ...none, externalObservation: true },
} as const satisfies Record<string, Capabilities>;

export type ProviderName = keyof typeof CAPABILITIES;

export function capabilitiesOf(provider: string): Capabilities {
  return (CAPABILITIES as Record<string, Capabilities>)[provider] ?? none;
}

export function supports(provider: string, flag: CapabilityFlag): boolean {
  return capabilitiesOf(provider)[flag];
}
