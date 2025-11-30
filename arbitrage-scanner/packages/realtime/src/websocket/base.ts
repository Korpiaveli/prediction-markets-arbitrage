/**
 * Base WebSocket Manager
 *
 * Provides connection management, reconnection logic, heartbeat,
 * and event handling for real-time price feeds.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'eventemitter3';
import { ConnectionState, WebSocketConfig } from '../types';

export abstract class BaseWebSocketManager extends EventEmitter<{
  connected: () => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
  message: (data: any) => void;
  price_update: (update: any) => void;
}> {
  protected ws: WebSocket | null = null;
  protected state: ConnectionState = ConnectionState.DISCONNECTED;
  protected reconnectAttempts = 0;
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected heartbeatTimer: NodeJS.Timeout | null = null;
  protected subscribedMarkets: Set<string> = new Set();

  constructor(protected readonly config: WebSocketConfig) {
    super();
    this.validateConfig();
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.url) {
      throw new Error('WebSocket URL is required');
    }
    // Set defaults
    this.config.reconnect = this.config.reconnect ?? true;
    this.config.reconnectInterval = this.config.reconnectInterval ?? 5000;
    this.config.maxReconnectAttempts = this.config.maxReconnectAttempts ?? 10;
    this.config.heartbeatInterval = this.config.heartbeatInterval ?? 30000;
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      this.ws = await this.createWebSocket();
      this.setupEventHandlers();
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Create WebSocket connection (can be overridden for custom headers)
   */
  protected async createWebSocket(): Promise<WebSocket> {
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.url, { headers });

      ws.once('open', () => resolve(ws));
      ws.once('error', reject);

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
    this.ws.on('error', (error) => this.handleError(error));
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('ping', () => this.handlePing());
    this.ws.on('pong', () => this.handlePong());
  }

  /**
   * Handle connection open
   */
  private async handleOpen(): Promise<void> {
    this.setState(ConnectionState.CONNECTED);
    this.reconnectAttempts = 0;
    this.emit('connected');
    this.startHeartbeat();

    // Re-subscribe to markets
    await this.resubscribe();

    // Subscribe to initial markets
    if (this.config.subscribeOnConnect) {
      for (const marketId of this.config.subscribeOnConnect) {
        await this.subscribe(marketId);
      }
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    const wasConnected = this.state === ConnectionState.CONNECTED;

    this.setState(ConnectionState.DISCONNECTED);
    this.ws = null;

    if (wasConnected) {
      this.emit('disconnected', reason || `Code: ${code}`);
    }

    if (this.config.reconnect && code !== 1000) {
      this.attemptReconnect();
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    this.emit('error', error);

    if (this.state === ConnectionState.CONNECTING) {
      this.handleConnectionError(error);
    }
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: Error): void {
    this.setState(ConnectionState.FAILED);
    this.emit('error', new Error(`Connection failed: ${error.message}`));

    if (this.config.reconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = this.parseMessage(data);
      this.emit('message', message);
      this.processMessage(message);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  /**
   * Parse incoming message (override for custom parsing)
   */
  protected parseMessage(data: WebSocket.Data): any {
    return JSON.parse(data.toString());
  }

  /**
   * Process parsed message (must be implemented by subclass)
   */
  protected abstract processMessage(message: any): void;

  /**
   * Handle ping
   */
  private handlePing(): void {
    this.ws?.pong();
  }

  /**
   * Handle pong
   */
  private handlePong(): void {
    // Heartbeat acknowledged
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendHeartbeat();
      }
    }, this.config.heartbeatInterval!);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat (override for custom heartbeat)
   */
  protected sendHeartbeat(): void {
    this.ws?.ping();
  }

  /**
   * Attempt reconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      this.setState(ConnectionState.FAILED);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.setState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.emit('error', new Error(`Reconnection failed: ${error.message}`));
      });
    }, this.config.reconnectInterval!);
  }

  /**
   * Subscribe to market updates
   */
  async subscribe(marketId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to WebSocket');
    }

    this.subscribedMarkets.add(marketId);
    await this.sendSubscribe(marketId);
  }

  /**
   * Unsubscribe from market updates
   */
  async unsubscribe(marketId: string): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    this.subscribedMarkets.delete(marketId);
    await this.sendUnsubscribe(marketId);
  }

  /**
   * Send subscribe message (must be implemented by subclass)
   */
  protected abstract sendSubscribe(marketId: string): Promise<void>;

  /**
   * Send unsubscribe message (must be implemented by subclass)
   */
  protected abstract sendUnsubscribe(marketId: string): Promise<void>;

  /**
   * Re-subscribe to all markets after reconnection
   */
  private async resubscribe(): Promise<void> {
    const markets = Array.from(this.subscribedMarkets);
    for (const marketId of markets) {
      await this.sendSubscribe(marketId);
    }
  }

  /**
   * Send message to WebSocket
   */
  protected send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws.send(message);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.config.reconnect = false; // Prevent auto-reconnect

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState(ConnectionState.DISCONNECTED);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    this.state = state;
  }

  /**
   * Get subscribed markets
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscribedMarkets);
  }
}
