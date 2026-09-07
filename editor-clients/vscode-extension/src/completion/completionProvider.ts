import * as vscode from 'vscode';
import { AICoworkClient } from '../client/aiCoworkClient';
import { ContextProvider } from './context_provider';
import { GhostTextRenderer } from './ghost_text';
import { logger } from '../utils/logger';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    private client: AICoworkClient;
    private contextProvider: ContextProvider;
    private ghostRenderer: GhostTextRenderer;
    private debounceTimer: NodeJS.Timeout | undefined;
    private readonly DEBOUNCE_DELAY = 300; // ms

    constructor(client: AICoworkClient) {
        this.client = client;
        this.contextProvider = new ContextProvider();
        this.ghostRenderer = new GhostTextRenderer();
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
        // Skip if not in a supported language
        if (!this.isSupportedLanguage(document.languageId)) {
            return undefined;
        }

        // Check if the user is actively typing (avoid completions during rapid typing)
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            // Debounce automatic triggers
            return this.debounceCompletion(document, position, context, token);
        }

        // For explicit triggers (like keyboard shortcut), process immediately
        return this.generateCompletion(document, position, token);
    }

    private async debounceCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
        return new Promise((resolve) => {
            // Clear any existing debounce timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            // Set a new debounce timer
            this.debounceTimer = setTimeout(async () => {
                const result = await this.generateCompletion(document, position, token);
                resolve(result);
            }, this.DEBOUNCE_DELAY);
        });
    }

    private async generateCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
        try {
            // Collect context from the current file
            const contextData = await this.contextProvider.collectContext(document, position);
            
            if (!contextData) {
                return undefined;
            }

            logger.debug('Requesting completion with context', { 
                file: document.fileName, 
                position: position.line,
                contextLength: contextData.context.length
            });

            // Send request to backend server
            const completionResponse = await this.client.requestCompletion({
                filePath: document.fileName,
                language: document.languageId,
                context: contextData.context,
                cursorPosition: {
                    line: position.line,
                    character: position.character
                },
                symbols: contextData.symbols,
                imports: contextData.imports
            }, token);

            if (!completionResponse || !completionResponse.completion) {
                return undefined;
            }

            // Generate ghost text
            const ghostText = this.ghostRenderer.generateGhostText(
                completionResponse.completion,
                document,
                position
            );

            if (!ghostText) {
                return undefined;
            }

            // Create the inline completion item
            const completionItem = new vscode.InlineCompletionItem(
                ghostText,
                new vscode.Range(position, position),
                {
                    title: 'Accept AI Completion',
                    command: 'ai-cowork.acceptCompletion'
                }
            );

            // Add tooltip with confidence information
            if (completionResponse.confidence) {
                completionItem.command = {
                    title: 'Accept AI Completion',
                    command: 'ai-cowork.acceptCompletion',
                    arguments: [{
                        confidence: completionResponse.confidence,
                        duration: completionResponse.duration
                    }]
                };
            }

            return [completionItem];

        } catch (error) {
            logger.error('Error generating completion', error);
            return undefined;
        }
    }

    private isSupportedLanguage(languageId: string): boolean {
        const supportedLanguages = [
            'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
            'python', 'java', 'cpp', 'c', 'go', 'rust', 'php', 'ruby',
            'swift', 'kotlin', 'csharp', 'html', 'css', 'scss', 'less'
        ];
        return supportedLanguages.includes(languageId);
    }
}