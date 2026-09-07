import * as vscode from 'vscode';
import { AICoworkClient } from '../client/aiCoworkClient';
import { logger } from '../utils/logger';
import { FileUtils } from '../utils/file_utils';
import { SettingsManager } from '../config/settings';

export interface CommandHandlerContext {
    client: AICoworkClient;
    settings: SettingsManager;
}

export class CommandHandlers {
    private static instance: CommandHandlers;
    private client: AICoworkClient;
    private settings: SettingsManager;
    private statusBarItem: vscode.StatusBarItem | undefined;

    private constructor(context: CommandHandlerContext) {
        this.client = context.client;
        this.settings = context.settings;
    }

    static initialize(context: CommandHandlerContext): void {
        if (!CommandHandlers.instance) {
            CommandHandlers.instance = new CommandHandlers(context);
        }
    }

    static getInstance(): CommandHandlers {
        if (!CommandHandlers.instance) {
            throw new Error('CommandHandlers not initialized');
        }
        return CommandHandlers.instance;
    }

    /**
     * Handler: Open Chat Panel
     */
    async openChat(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.ai-cowork');
            logger.info('Chat panel opened');
        } catch (error) {
            logger.error('Failed to open chat panel', error);
            vscode.window.showErrorMessage('Failed to open AI Cowork chat');
        }
    }

    /**
     * Handler: Accept Completion
     */
    async acceptCompletion(args?: any): Promise<void> {
        if (args?.confidence) {
            logger.info('Completion accepted', { 
                confidence: args.confidence, 
                duration: args.duration 
            });
        } else {
            logger.info('Completion accepted');
        }
        
        if (this.client.isConnected()) {
            try {
                await this.client.sendFeedback({
                    type: 'completion_accepted',
                    timestamp: Date.now(),
                    data: args || {}
                });
            } catch (error) {
                logger.error('Failed to send feedback', error);
            }
        }
    }

    /**
     * Handler: Trigger Completion
     */
    async triggerCompletion(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        logger.info('Manual completion triggered');
    }

    /**
     * Handler: Clear Ghost Text
     */
    async clearGhostText(): Promise<void> {
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
        logger.info('Ghost text cleared');
    }

    /**
     * Handler: Build Project
     */
    async buildProject(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const buildCommand = this.settings.getBuildCommand();
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AI-Cowork: Building project...',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Running build...' });
                
                const result = await this.client.requestBuild({
                    workspacePath: workspaceFolder.uri.fsPath,
                    buildCommand: buildCommand
                });
                
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage('Build cancelled');
                    return;
                }
                
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
    }

    /**
     * Handler: Run Tests
     */
    async runTests(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const testCommand = this.settings.getTestCommand();
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AI-Cowork: Running tests...',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Running tests...' });
                
                const result = await this.client.requestTest({
                    workspacePath: workspaceFolder.uri.fsPath,
                    testCommand: testCommand
                });
                
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage('Tests cancelled');
                    return;
                }
                
                if (result.success) {
                    vscode.window.showInformationMessage(`✅ Tests passed! (${result.passed}/${result.total})`);
                    logger.info('Tests completed', { passed: result.passed, total: result.total });
                } else {
                    vscode.window.showErrorMessage(`❌ Tests failed: ${result.failed} failures`);
                    logger.error('Tests failed', { failed: result.failed, output: result.output });
                }
                
                progress.report({ increment: 100 });
            });
        } catch (error) {
            logger.error('Test command failed', error);
            vscode.window.showErrorMessage(`Tests failed: ${error}`);
        }
    }

    /**
     * Handler: Show Settings
     */
    async showSettings(): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'ai-cowork');
    }

    /**
     * Handler: Show Status
     */
    async showStatus(): Promise<void> {
        const isConnected = this.client.isConnected();
        const status = isConnected ? '🟢 Connected' : '🔴 Disconnected';
        const serverUrl = this.settings.getServerUrl();
        
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
    }

    /**
     * Handler: Reconnect
     */
    async reconnect(): Promise<void> {
        try {
            await this.client.disconnect();
            await this.client.connect();
            vscode.window.showInformationMessage('✅ Reconnected to AI Cowork server');
            logger.info('Reconnected to server');
            this.updateStatusBar();
        } catch (error) {
            logger.error('Reconnection failed', error);
            vscode.window.showErrorMessage(`Reconnection failed: ${error}`);
        }
    }

    /**
     * Handler: Suggest Fix
     */
    async suggestFix(): Promise<void> {
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
            const fixResponse = await this.client.requestFix({
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
            } else {
                vscode.window.showInformationMessage('No fix suggestion available');
            }
        } catch (error) {
            logger.error('Fix suggestion failed', error);
            vscode.window.showErrorMessage(`Failed to get fix suggestion: ${error}`);
        }
    }

    /**
     * Handler: Explain Code
     */
    async explainCode(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        if (!text) {
            vscode.window.showWarningMessage('Please select some code to explain');
            return;
        }

        try {
            const explanation = await this.client.requestExplanation({
                filePath: editor.document.fileName,
                language: editor.document.languageId,
                selectedText: text,
                context: editor.document.getText()
            });

            if (explanation) {
                // Show explanation in a new document or webview
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Code Explanation\n\n${explanation}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: true });
                logger.info('Code explanation provided', { file: editor.document.fileName });
            }
        } catch (error) {
            logger.error('Code explanation failed', error);
            vscode.window.showErrorMessage(`Failed to explain code: ${error}`);
        }
    }

    /**
     * Handler: Generate Documentation
     */
    async generateDocumentation(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        if (!text) {
            vscode.window.showWarningMessage('Please select code to document');
            return;
        }

        try {
            const documentation = await this.client.requestDocumentation({
                filePath: editor.document.fileName,
                language: editor.document.languageId,
                selectedText: text,
                context: editor.document.getText()
            });

            if (documentation) {
                const edit = new vscode.WorkspaceEdit();
                // Insert documentation at cursor position
                const position = selection.start;
                edit.insert(editor.document.uri, position, documentation + '\n');
                await vscode.workspace.applyEdit(edit);
                
                vscode.window.showInformationMessage('📝 Documentation generated!');
                logger.info('Documentation generated', { file: editor.document.fileName });
            }
        } catch (error) {
            logger.error('Documentation generation failed', error);
            vscode.window.showErrorMessage(`Failed to generate documentation: ${error}`);
        }
    }

    /**
     * Handler: Refactor Code
     */
    async refactorCode(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        if (!text) {
            vscode.window.showWarningMessage('Please select code to refactor');
            return;
        }

        try {
            const refactored = await this.client.requestRefactor({
                filePath: editor.document.fileName,
                language: editor.document.languageId,
                selectedText: text,
                context: editor.document.getText()
            });

            if (refactored && refactored.code) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(editor.document.uri, selection, refactored.code);
                await vscode.workspace.applyEdit(edit);
                
                vscode.window.showInformationMessage(`🔄 Code refactored! (${refactored.changes} changes)`);
                logger.info('Code refactored', { 
                    file: editor.document.fileName,
                    changes: refactored.changes 
                });
            }
        } catch (error) {
            logger.error('Refactor failed', error);
            vscode.window.showErrorMessage(`Failed to refactor code: ${error}`);
        }
    }

    /**
     * Handler: Analyze Performance
     */
    async analyzePerformance(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        try {
            const analysis = await this.client.requestPerformanceAnalysis({
                filePath: editor.document.fileName,
                content: editor.document.getText(),
                language: editor.document.languageId
            });

            if (analysis) {
                // Show analysis results
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Performance Analysis\n\n${analysis}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: true });
                logger.info('Performance analysis completed', { file: editor.document.fileName });
            }
        } catch (error) {
            logger.error('Performance analysis failed', error);
            vscode.window.showErrorMessage(`Failed to analyze performance: ${error}`);
        }
    }

    /**
     * Handler: Save Context to Memory
     */
    async saveContextToMemory(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        try {
            const context = {
                filePath: editor.document.fileName,
                content: editor.document.getText(),
                language: editor.document.languageId,
                cursorPosition: editor.selection.active,
                timestamp: Date.now()
            };

            await this.client.saveMemory({
                type: 'code_context',
                data: context,
                metadata: {
                    project: FileUtils.getWorkspaceRoot() || 'unknown'
                }
            });

            vscode.window.showInformationMessage('💾 Context saved to memory!');
            logger.info('Context saved to memory', { file: editor.document.fileName });
        } catch (error) {
            logger.error('Failed to save context to memory', error);
            vscode.window.showErrorMessage(`Failed to save context: ${error}`);
        }
    }

    /**
     * Update Status Bar
     */
    updateStatusBar(): void {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right, 
                100
            );
        }

        const isConnected = this.client.isConnected();
        this.statusBarItem.text = isConnected ? '$(sparkle) AI-Cowork' : '$(sparkle) AI-Cowork (offline)';
        this.statusBarItem.tooltip = isConnected ? 'AI Cowork is connected' : 'AI Cowork is disconnected';
        this.statusBarItem.command = 'ai-cowork.showStatus';
        this.statusBarItem.show();
    }

    /**
     * Dispose status bar
     */
    dispose(): void {
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = undefined;
        }
    }
}