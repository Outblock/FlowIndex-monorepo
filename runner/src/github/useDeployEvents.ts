import { useEffect, useRef } from 'react';

export interface DeployEvent {
  type: 'deploy:started' | 'deploy:completed' | 'deploy:failed' | 'deploy:push';
  data: {
    sha: string;
    branch: string;
    network?: string;
    environment?: string;
    status?: string;
    logs_url?: string;
    duration_ms?: number;
    message?: string;
    author?: string;
  };
}

export function useDeployEvents(
  projectId: string | undefined,
  onEvent: (event: DeployEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/lsp`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'subscribe:deploy', project_id: projectId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type?.startsWith('deploy:')) {
            onEventRef.current(data as DeployEvent);
          }
        } catch {
          // ignore non-JSON messages (LSP responses)
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [projectId]);
}
