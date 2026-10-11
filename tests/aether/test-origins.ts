// Host/origin literals for app.inject() and string checks only; tests never listen on these ports.
export const INJECT_CONTROL_PORT = 8780;
export const injectHost = `127.0.0.1:${INJECT_CONTROL_PORT}`;
export const injectOrigin = `http://${injectHost}`;
