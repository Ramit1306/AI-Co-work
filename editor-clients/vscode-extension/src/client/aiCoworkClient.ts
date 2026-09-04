// src/client/aiCoworkClient.ts
import { Connection } from './connection';
import { Message } from './protocol';
import * as vscode from 'vscode';

export interface CompletionContext {
  filePath: string;
  content: string;
  cursorPosition: { line: number; character: number };
  language: string;
  symbols?: string[];
  imports?: string[];
}

export interface CompletionResponse {
  text: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export class AICoworkClient {
  private connection: Connection;
  private baseUrl: string;
  private connected = false;

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl;
    this.connection = new Connection(serverUrl);
    this.connection.onMessage((msg) => this.handleNotification(msg));
  }

  async connect(): Promise<void> {
    try {
      await this.connection.connect();
      this.connected = true;
      vscode.window.showInformationMessage('AI-Cowork: Connected to server');
    } catch (error) {
      vscode.window.showErrorMessage(`AI-Cowork: Connection failed - ${error}`);
      throw error;
    }
  }

  async getCompletion(context: CompletionContext): Promise<CompletionResponse | null> {
    if (!this.connected) await this.connect();
    try {
      return await this.connection.sendRequest('completion', context);
    } catch (error) {
      vscode.window.showErrorMessage(`Completion failed: ${error}`);
      return null;
    }
  }

  async sendChatMessage(message: string, conversationId?: string): Promise<string> {
    if (!this.connected) await this.connect();
    try {
      const result = await this.connection.sendRequest('chat', { message, conversationId });
      return result.response;
    } catch (error) {
      vscode.window.showErrorMessage(`Chat failed: ${error}`);
      throw error;
    }
  }

  async applyChanges(filePath: string, changes: any[]): Promise<boolean> {
    if (!this.connected) await this.connect();
    try {
      await this.connection.sendRequest('applyChanges', { filePath, changes });
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Apply changes failed: ${error}`);
      return false;
    }
  }

  async getStatus(): Promise<any> {
    if (!this.connected) await this.connect();
    try {
      return await this.connection.sendRequest('status', {});
    } catch (error) {
      return { connected: false, error: String(error) };
    }
  }

  private handleNotification(msg: Message): void {
    if (msg.method === 'progress') {
      vscode.window.showInformationMessage(`Progress: ${msg.params?.message || ''}`);
    } else if (msg.method === 'error') {
      vscode.window.showErrorMessage(`Server error: ${msg.params?.message || ''}`);
    }
  }

  disconnect(): void {
    this.connection.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.connection.isConnected();
  }
}