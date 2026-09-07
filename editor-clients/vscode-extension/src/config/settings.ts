import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface AICoworkSettings {
    serverUrl: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    enableGhostText: boolean;
    ghostTextDelay: number;
    maxGhostTextLines: number;
    enableTelemetry: boolean;
    buildCommand: string;
    testCommand: string;
    debugMode: boolean;
    maxContextLines: number;
    enableAutoCompletion: boolean;
    completionTriggerChars: string[];
    memoryEnabled: boolean;
    memoryPath: string;
}

export class SettingsManager {
    private static instance: SettingsManager;
    private settings: AICoworkSettings;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.settings = this.loadSettings();
        this.setupChangeListener();
    }

    static getInstance(): SettingsManager {
        if (!SettingsManager.instance) {
            SettingsManager.instance = new SettingsManager();
        }
        return SettingsManager.instance;
    }

    private loadSettings(): AICoworkSettings {
        const config = vscode.workspace.getConfiguration('ai-cowork');
        
        return {
            serverUrl: config.get<string>('serverUrl', 'http://localhost:3000'),
            reconnectInterval: config.get<number>('reconnectInterval', 3000),
            maxReconnectAttempts: config.get<number>('maxReconnectAttempts', 5),
            enableGhostText: config.get<boolean>('enableGhostText', true),
            ghostTextDelay: config.get<number>('ghostTextDelay', 300),
            maxGhostTextLines: config.get<number>('maxGhostTextLines', 10),
            enableTelemetry: config.get<boolean>('enableTelemetry', false),
            buildCommand: config.get<string>('buildCommand', 'npm run build'),
            testCommand: config.get<string>('testCommand', 'npm test'),
            debugMode: config.get<boolean>('debugMode', false),
            maxContextLines: config.get<number>('maxContextLines', 100),
            enableAutoCompletion: config.get<boolean>('enableAutoCompletion', true),
            completionTriggerChars: config.get<string[]>('completionTriggerChars', ['.', ':', '(', '{', '[', ' ']),
            memoryEnabled: config.get<boolean>('memoryEnabled', true),
            memoryPath: config.get<string>('memoryPath', ''),
        };
    }

    private setupChangeListener(): void {
        const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('ai-cowork')) {
                this.settings = this.loadSettings();
                logger.info('AI-Cowork settings updated', this.settings);
                // Notify any subscribers about settings change
                this.onSettingsChanged();
            }
        });
        this.disposables.push(disposable);
    }

    get<K extends keyof AICoworkSettings>(key: K): AICoworkSettings[K] {
        return this.settings[key];
    }

    getAll(): AICoworkSettings {
        return { ...this.settings };
    }

    async updateSetting<K extends keyof AICoworkSettings>(
        key: K,
        value: AICoworkSettings[K]
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('ai-cowork');
        await config.update(key, value, vscode.ConfigurationTarget.Global);
        this.settings[key] = value;
        logger.info(`Settings updated: ${key} = ${value}`);
    }

    private onSettingsChanged(): void {
        // This is called when settings change - can be used to update UI or behavior
        // For example, reload the status bar, update completion behavior, etc.
    }

    // Helper methods for common settings
    getServerUrl(): string {
        return this.settings.serverUrl;
    }

    isGhostTextEnabled(): boolean {
        return this.settings.enableGhostText;
    }

    isDebugMode(): boolean {
        return this.settings.debugMode;
    }

    getGhostTextDelay(): number {
        return this.settings.ghostTextDelay;
    }

    getMaxContextLines(): number {
        return this.settings.maxContextLines;
    }

    isAutoCompletionEnabled(): boolean {
        return this.settings.enableAutoCompletion;
    }

    isMemoryEnabled(): boolean {
        return this.settings.memoryEnabled;
    }

    getBuildCommand(): string {
        return this.settings.buildCommand;
    }

    getTestCommand(): string {
        return this.settings.testCommand;
    }

    getCompletionTriggerChars(): string[] {
        return this.settings.completionTriggerChars;
    }

    async resetToDefaults(): Promise<void> {
        const defaultSettings = {
            serverUrl: 'http://localhost:3000',
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            enableGhostText: true,
            ghostTextDelay: 300,
            maxGhostTextLines: 10,
            enableTelemetry: false,
            buildCommand: 'npm run build',
            testCommand: 'npm test',
            debugMode: false,
            maxContextLines: 100,
            enableAutoCompletion: true,
            completionTriggerChars: ['.', ':', '(', '{', '[', ' '],
            memoryEnabled: true,
            memoryPath: '',
        };

        const config = vscode.workspace.getConfiguration('ai-cowork');
        for (const [key, value] of Object.entries(defaultSettings)) {
            await config.update(key, value, vscode.ConfigurationTarget.Global);
        }
        
        this.settings = this.loadSettings();
        logger.info('Settings reset to defaults');
        vscode.window.showInformationMessage('AI-Cowork settings reset to defaults');
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    // Helper to validate settings
    validateSettings(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const settings = this.settings;

        // Validate server URL
        try {
            new URL(settings.serverUrl);
        } catch {
            errors.push('Invalid server URL format');
        }

        // Validate numeric values
        if (settings.reconnectInterval < 1000) {
            errors.push('Reconnect interval must be at least 1000ms');
        }

        if (settings.maxReconnectAttempts < 1) {
            errors.push('Max reconnect attempts must be at least 1');
        }

        if (settings.ghostTextDelay < 50) {
            errors.push('Ghost text delay must be at least 50ms');
        }

        if (settings.maxGhostTextLines < 1) {
            errors.push('Max ghost text lines must be at least 1');
        }

        if (settings.maxContextLines < 10) {
            errors.push('Max context lines must be at least 10');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Get workspace-specific settings
    getWorkspaceSetting<T>(key: string, defaultValue?: T): T {
        const config = vscode.workspace.getConfiguration('ai-cowork');
        return config.get<T>(key, defaultValue as T);
    }

    // Check if a feature is enabled in the current workspace
    isFeatureEnabled(feature: string): boolean {
        const config = vscode.workspace.getConfiguration('ai-cowork');
        return config.get<boolean>(`features.${feature}`, true);
    }
}