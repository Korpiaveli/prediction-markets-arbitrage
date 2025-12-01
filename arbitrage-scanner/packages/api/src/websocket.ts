import { WebSocketServer, WebSocket } from 'ws';
import { ApiContext } from './types';

export function createWebSocketHandler(wss: WebSocketServer, context: ApiContext) {
  console.log('[WebSocket] Handler initialized');

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Arbitrage Scanner WebSocket'
    }));

    // Subscribe to scanner events if available
    if (context.scanner) {
      const onOpportunity = (opp: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'opportunity',
            data: opp
          }));
        }
      };

      const onScanComplete = (opps: any[]) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'scan:complete',
            data: {
              count: opps.length,
              timestamp: new Date()
            }
          }));
        }
      };

      context.scanner.on('opportunity:found', onOpportunity);
      context.scanner.on('scan:complete', onScanComplete);

      ws.on('close', () => {
        context.scanner?.off('opportunity:found', onOpportunity);
        context.scanner?.off('scan:complete', onScanComplete);
        console.log('[WebSocket] Client disconnected');
      });
    }

    // Handle incoming messages
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('[WebSocket] Received:', data);

        // Handle ping/pong
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });
}
