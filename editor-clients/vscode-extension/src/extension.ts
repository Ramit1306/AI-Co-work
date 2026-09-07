import * as vscode from 'vscode';
import { AICoworkClient } from './client/aiCoworkClient';
import { CompletionProvider } from './completion/completionProvider';
import { registerCommands } from './commands/registerCommands';
import { logger } from './utils/logger';

let client: AICoworkClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
    logger.info('AI-Cowork extension is now active!');

    try {
        // Initialize the AI Cowork client
        client = new AICoworkClient({
            serverUrl: vscode.workspace.getConfiguration('ai-cowork').get('serverUrl', 'http://localhost:3000'),
            reconnectInterval: 3000,
            maxReconnectAttempts: 5
        });

        // Connect to the backend server
        await client.connect();
        logger.info('Connected to AI Cowork backend server');

        // Register the completion provider
        const completionProvider = new CompletionProvider(client);
        const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,go,rs}' },
            completionProvider
        );
        context.subscriptions.push(completionDisposable);

        // Register all commands
        const commandsDisposable = registerCommands(context, client);
        context.subscriptions.push(commandsDisposable);

        // Show welcome message
        vscode.window.showInformationMessage('AI-Cowork extension activated! 🤝');

        // Set up status bar item
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(sparkle) AI-Cowork';
        statusBarItem.tooltip = 'AI Cowork is connected and ready';
        statusBarItem.command = 'ai-cowork.openChat';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

    } catch (error) {
        logger.error('Failed to activate AI-Cowork extension', error);
        vscode.window.showErrorMessage(`AI-Cowork: Failed to connect to backend server: ${error}`);
    }
}

export async function deactivate() {
    logger.info('AI-Cowork extension is deactivating...');
    
    if (client) {
        try {
            await client.disconnect();
            logger.info('Disconnected from AI Cowork backend server');
        } catch (error) {
            logger.error('Error during disconnection', error);
        }
    }
}