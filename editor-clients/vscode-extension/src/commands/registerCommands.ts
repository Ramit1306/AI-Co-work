import * as vscode from 'vscode';
import { AICoworkClient } from '../client/aiCoworkClient';
import { logger } from '../utils/logger';
import { ChatViewProvider } from '../chat/chatViewProvider';

export function registerCommands(
    context: vscode.ExtensionContext,
    client: AICoworkClient
): vscode.Disposable {
    // Register the chat view provider
    const chatProvider = new ChatViewProvider(context.extensionUri, client);
    const chatView = vscode.window.registerWebviewViewProvider(
        'ai-cowork.chatView',
        chatProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );

    // Register all commands
    const commands = [
        // Open chat panel
        vscode.commands.registerCommand('ai-cowork.openChat', async () => {
            try {
                await vscode.commands.executeCommand('workbench.view.extension.ai-cowork');
                logger.info('Chat panel opened');
            } catch (error) {
                logger.error('Failed to open chat panel', error);
                vscode.window.showErrorMessage('Failed to open AI Cowork chat');
            }
        }),

        // Accept completion command
        vscode.commands.registerCommand('ai-cowork.acceptCompletion', async (args?: any) => {
            // This is triggered when a user accepts an inline completion
            // The actual completion is handled by VS Code's built-in mechanism
            // We just log it for telemetry
            if (args?.confidence) {
                logger.info('Completion accepted', { confidence: args.confidence, duration: args.duration });
            } else {
                logger.info('Completion accepted');
            }
            
            // You could send a feedback event to the backend here
            if (client && client.isConnected()) {
                try {
                    await client.sendFeedback({
                        type: 'completion_accepted',
                        timestamp: Date.now(),
                        data: args || {}
                    });
                } catch (error) {
                    logger.error('Failed to send feedback', error);
                }
            }
        }),

        // Trigger explicit completion (Ctrl+Space / Cmd+Space style)
        vscode.commands.registerCommand('ai-cowork.triggerCompletion', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            // VS Code will automatically trigger the completion provider
            // This command just makes it explicit
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
            logger.info('Manual completion triggered');
        }),

        // Clear ghost text
        vscode.commands.registerCommand('ai-cowork.clearGhostText', () => {
            // This clears any active ghost text
            vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
            logger.info('Ghost text cleared');
        }),

        // Run AI build command
        vscode.commands.registerCommand('ai-cowork.build', async () => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder found');
                    return;
                }

                const buildCommand = vscode.workspace.getConfiguration('ai-cowork').get('buildCommand', 'npm run build');
                
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'AI-Cowork: Building project...',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0, message: 'Running build...' });
                    
                    // Build via the backend
                    const result = await client.requestBuild({
                        workspacePath: workspaceFolder.uri.fsPath,
                        buildCommand: buildCommand
                    });
                    
                    if (result.success) {
                        vscode.window.showInformationMessage('✅ Build completed successfully!');
                        logger.info('Build completed', { output: result.output });
                    } else {
                        vscode.window.showErrorMessage(`❌ Build failed: ${result.error}`);
                        logger.error('Build failed', { error: result.error, output: result.output });
                    }
                    
                    progress.report({ increment: 100 });
                });
            } catch (error) {
                logger.error('Build command failed', error);
                vscode.window.showErrorMessage(`Build failed: ${error}`);
            }
        }),

        // Show extension settings
        vscode.commands.registerCommand('ai-cowork.showSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'ai-cowork');
        }),

        // Show connection status
        vscode.commands.registerCommand('ai-cowork.showStatus', async () => {
            const isConnected = client && client.isConnected();
            const status = isConnected ? '🟢 Connected' : '🔴 Disconnected';
            const serverUrl = vscode.workspace.getConfiguration('ai-cowork').get('serverUrl', 'http://localhost:3000');
            
            vscode.window.showInformationMessage(
                `AI-Cowork Status: ${status}\nServer: ${serverUrl}`,
                'Reconnect',
                'Settings'
            ).then(selection => {
                if (selection === 'Reconnect') {
                    vscode.commands.executeCommand('ai-cowork.reconnect');
                } else if (selection === 'Settings') {
                    vscode.commands.executeCommand('ai-cowork.showSettings');
                }
            });
        }),

        // Reconnect to backend
        vscode.commands.registerCommand('ai-cowork.reconnect', async () => {
            if (client) {
                try {
                    await client.disconnect();
                    await client.connect();
                    vscode.window.showInformationMessage('✅ Reconnected to AI Cowork server');
                    logger.info('Reconnected to server');
                } catch (error) {
                    logger.error('Reconnection failed', error);
                    vscode.window.showErrorMessage(`Reconnection failed: ${error}`);
                }
            }
        }),

        // Quick fix suggestion
        vscode.commands.registerCommand('ai-cowork.suggestFix', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const text = editor.document.getText(selection);
            
            if (!text) {
                vscode.window.showWarningMessage('Please select some code to suggest a fix');
                return;
            }

            try {
                const fixResponse = await client.requestFix({
                    filePath: editor.document.fileName,
                    language: editor.document.languageId,
                    selectedText: text,
                    context: editor.document.getText()
                });

                if (fixResponse && fixResponse.suggestion) {
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(editor.document.uri, selection, fixResponse.suggestion);
                    await vscode.workspace.applyEdit(edit);
                    
                    vscode.window.showInformationMessage('💡 AI fix applied!');
                    logger.info('AI fix applied', { file: editor.document.fileName });
                }
            } catch (error) {
                logger.error('Fix suggestion failed', error);
                vscode.window.showErrorMessage(`Failed to get fix suggestion: ${error}`);
            }
        })
    ];

    return vscode.Disposable.from(
        chatView,
        ...commands
    );
}