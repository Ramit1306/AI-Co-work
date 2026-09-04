// src/client/connection.ts
import { Protocol, Message } from './protocol';

export class Connection {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pendingRequests = new Map<string, (msg: Message) => void>();
  private messageHandler: ((msg: Message) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };
        this.ws.onmessage = (event) => this.handleMessage(event.data);
        this.ws.onclose = () => {
          this.stopHeartbeat();
          this.reconnect();
        };
        this.ws.onerror = (error) => reject(error);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: string): void {
    const msg = Protocol.deserialize(data);
    if (msg.type === 'response' && msg.id) {
      const handler = this.pendingRequests.get(msg.id);
      if (handler) {
        handler(msg);
        this.pendingRequests.delete(msg.id);
      }
    } else if (this.messageHandler) {
      this.messageHandler(msg);
    }
  }

  sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Connection not open'));
        return;
      }
      const msg = Protocol.createRequest(method, params);
      this.pendingRequests.set(msg.id, (response) => {
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result);
      });
      this.ws.send(Protocol.serialize(msg));
    });
  }

  sendNotification(method: string, params: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = Protocol.createNotification(method, params);
    this.ws.send(Protocol.serialize(msg));
  }

  onMessage(handler: (msg: Message) => void): void {
    this.messageHandler = handler;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendNotification('heartbeat', { timestamp: Date.now() });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    setTimeout(() => {
      this.connect().catch(() => this.reconnect());
    }, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1));
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}