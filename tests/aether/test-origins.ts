// Host/origin literals for app.inject() and string checks only; tests never listen on these ports.
export const INJECT_CONTROL_PORT = 8780;
export const INJECT_OTHER_PORT = 8781;
export const INJECT_APPROVALS_PORT = 5688;
export const injectHost = `127.0.0.1:${INJECT_CONTROL_PORT}`;
export const injectOrigin = `http://${injectHost}`;
export const injectOriginHeader = { host: injectHost, origin: injectOrigin } as const;
export const lanHost = (ip: string) => `${ip}:${INJECT_CONTROL_PORT}`;
export const lanOrigin = (ip: string) => `http://${lanHost(ip)}`;
