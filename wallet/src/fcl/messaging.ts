type MessageTarget = Window | null;

function getTarget(): MessageTarget {
  // Prefer window.opener (popup), fallback to window.parent (iframe)
  if (window.opener && window.opener !== window) return window.opener;
  if (window.parent && window.parent !== window) return window.parent;
  return null;
}

export function sendReady() {
  getTarget()?.postMessage({ type: 'FCL:VIEW:READY' }, '*');
}

export function approve(data: unknown) {
  getTarget()?.postMessage(
    {
      type: 'FCL:VIEW:RESPONSE',
      f_type: 'PollingResponse',
      f_vsn: '1.0.0',
      status: 'APPROVED',
      reason: null,
      data,
    },
    '*',
  );
}

export function decline(reason: string) {
  getTarget()?.postMessage(
    {
      type: 'FCL:VIEW:RESPONSE',
      f_type: 'PollingResponse',
      f_vsn: '1.0.0',
      status: 'DECLINED',
      reason,
      data: null,
    },
    '*',
  );
}

export function close() {
  getTarget()?.postMessage({ type: 'FCL:VIEW:CLOSE' }, '*');
}

export interface ReadyResponseData {
  type: string;
  body?: unknown;
  data?: unknown;
  config?: unknown;
}

/**
 * Listen for FCL:VIEW:READY:RESPONSE from the host app.
 * Returns cleanup function.
 */
export function onReadyResponse(
  callback: (data: ReadyResponseData) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'FCL:VIEW:READY:RESPONSE') {
      callback(event.data);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
