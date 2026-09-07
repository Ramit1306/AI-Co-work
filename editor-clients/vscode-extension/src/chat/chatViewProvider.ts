import * as vscode from 'vscode';
import * as path from 'path';
import { AICoworkClient } from '../client/aiCoworkClient';
import { logger } from '../utils/logger';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _webviewView?: vscode.WebviewView;
    private _messageQueue: string[] = [];
    private _isDisposed = false;
    private _conversationId?: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _client: AICoworkClient
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                await this._handleMessage(message);
            },
            undefined,
            []
        );

        // Send any queued messages
        this._sendQueuedMessages();
    }

    private async _handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'sendMessage':
                await this._handleSendMessage(message.text);
                break;
            case 'getHistory':
                await this._handleGetHistory();
                break;
            case 'clearHistory':
                await this._handleClearHistory();
                break;
            case 'exportChat':
                await this._handleExportChat();
                break;
            case 'fileAttachment':
                await this._handleFileAttachment(message.filePath);
                break;
            case 'codeContext':
                await this._handleCodeContext(message.line, message.character);
                break;
            case 'newConversation':
                await this._handleNewConversation();
                break;
            default:
                logger.warn('Unknown chat message command', message.command);
        }
    }

    private async _handleSendMessage(text: string): Promise<void> {
        if (!text || text.trim().length === 0) {
            return;
        }

        try {
            // Add user message to chat
            this._postMessageToWebview({
                type: 'userMessage',
                text: text,
                timestamp: Date.now()
            });

            // Show typing indicator
            this._postMessageToWebview({
                type: 'typing',
                isTyping: true
            });

            // Send to backend
            const response = await this._client.sendChatMessage(
                text,
                this._conversationId
            );

            // Hide typing indicator
            this._postMessageToWebview({
                type: 'typing',
                isTyping: false
            });

            // Add assistant response
            this._postMessageToWebview({
                type: 'assistantMessage',
                text: response,
                timestamp: Date.now()
            });

            logger.info('Chat message sent and received', { 
                textLength: text.length,
                responseLength: response.length 
            });
        } catch (error) {
            this._postMessageToWebview({
                type: 'typing',
                isTyping: false
            });

            this._postMessageToWebview({
                type: 'error',
                text: `Failed to send message: ${error}`,
                timestamp: Date.now()
            });

            logger.error('Failed to send chat message', error);
        }
    }

    private async _handleGetHistory(): Promise<void> {
        try {
            // Get chat history from backend
            const history = await this._client.getChatHistory(this._conversationId);
            
            this._postMessageToWebview({
                type: 'history',
                messages: history
            });
        } catch (error) {
            logger.error('Failed to get chat history', error);
        }
    }

    private async _handleClearHistory(): Promise<void> {
        try {
            await this._client.clearChatHistory(this._conversationId);
            
            this._postMessageToWebview({
                type: 'historyCleared'
            });
        } catch (error) {
            logger.error('Failed to clear chat history', error);
        }
    }

    private async _handleExportChat(): Promise<void> {
        try {
            const history = await this._client.getChatHistory(this._conversationId);
            
            if (!history || history.length === 0) {
                vscode.window.showWarningMessage('No chat history to export');
                return;
            }

            const exportContent = this._formatChatForExport(history);
            
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('ai-cowork-chat.md'),
                filters: {
                    'Markdown': ['md'],
                    'Text': ['txt'],
                    'JSON': ['json']
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(exportContent, 'utf8')
                );
                vscode.window.showInformationMessage('Chat exported successfully!');
            }
        } catch (error) {
            logger.error('Failed to export chat', error);
            vscode.window.showErrorMessage(`Failed to export chat: ${error}`);
        }
    }

    private async _handleFileAttachment(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            
            // Only send first 5000 characters to avoid overwhelming
            const truncatedContent = content.length > 5000 
                ? content.substring(0, 5000) + '\n... (truncated)'
                : content;

            this._postMessageToWebview({
                type: 'fileAttached',
                fileName: path.basename(filePath),
                content: truncatedContent,
                filePath: filePath
            });

            // Also send as user message context
            await this._handleSendMessage(
                `[Attached file: ${path.basename(filePath)}]\n${truncatedContent}`
            );
        } catch (error) {
            logger.error('Failed to attach file', error);
            vscode.window.showErrorMessage(`Failed to attach file: ${error}`);
        }
    }

    private async _handleCodeContext(line: number, character: number): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const position = new vscode.Position(line, character);
        const range = editor.document.getWordRangeAtPosition(position);
        
        if (!range) {
            vscode.window.showWarningMessage('No code context found');
            return;
        }

        const word = editor.document.getText(range);
        const lineText = editor.document.lineAt(line).text;

        this._postMessageToWebview({
            type: 'codeContext',
            word: word,
            line: lineText,
            file: path.basename(editor.document.fileName),
            position: { line, character }
        });
    }

    private async _handleNewConversation(): Promise<void> {
        this._conversationId = undefined;
        this._postMessageToWebview({
            type: 'newConversation'
        });
        vscode.window.showInformationMessage('New conversation started');
    }

    private _formatChatForExport(messages: any[]): string {
        let content = '# AI-Cowork Chat Export\n\n';
        content += `Exported: ${new Date().toLocaleString()}\n\n`;
        content += '---\n\n';

        for (const msg of messages) {
            const role = msg.role === 'user' ? '**User**' : '**AI-Cowork**';
            const timestamp = msg.timestamp 
                ? new Date(msg.timestamp).toLocaleString()
                : '';
            content += `### ${role} ${timestamp}\n\n`;
            content += `${msg.content}\n\n`;
            content += '---\n\n';
        }

        return content;
    }

    private _postMessageToWebview(message: any): void {
        if (this._webviewView) {
            this._webviewView.webview.postMessage(message);
        } else {
            this._messageQueue.push(JSON.stringify(message));
        }
    }

    private _sendQueuedMessages(): void {
        while (this._messageQueue.length > 0) {
            const message = this._messageQueue.shift();
            if (message && this._webviewView) {
                this._webviewView.webview.postMessage(JSON.parse(message));
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get paths to resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'chat', 'panel.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'chat', 'panel.css')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI-Cowork Chat</title>
    <link href="${styleUri}" rel="stylesheet" />
    <link href="${codiconsUri}" rel="stylesheet" />
</head>
<body>
    <div id="chat-container">
        <div id="chat-header">
            <h2>🤝 AI-Cowork Chat</h2>
            <div id="chat-controls">
                <button id="new-conversation-btn" class="icon-btn" title="New Conversation">
                    <span class="codicon codicon-new-file"></span>
                </button>
                <button id="export-chat-btn" class="icon-btn" title="Export Chat">
                    <span class="codicon codicon-export"></span>
                </button>
                <button id="clear-history-btn" class="icon-btn" title="Clear History">
                    <span class="codicon codicon-clear-all"></span>
                </button>
                <button id="attach-file-btn" class="icon-btn" title="Attach File">
                    <span class="codicon codicon-attach"></span>
                </button>
                <button id="add-context-btn" class="icon-btn" title="Add Code Context">
                    <span class="codicon codicon-code"></span>
                </button>
            </div>
        </div>
        <div id="chat-messages">
            <div id="welcome-message">
                <div class="message assistant">
                    <div class="message-content">
                        <p>👋 Welcome to AI-Cowork! I'm here to help you with your development tasks.</p>
                        <p>I can assist with:</p>
                        <ul>
                            <li>Code generation and completion</li>
                            <li>Debugging and fixing issues</li>
                            <li>Code review and suggestions</li>
                            <li>Project architecture and design</li>
                            <li>Documentation and testing</li>
                        </ul>
                        <p>Ask me anything about your code!</p>
                    </div>
                </div>
            </div>
        </div>
        <div id="chat-input-container">
            <textarea 
                id="chat-input" 
                rows="3" 
                placeholder="Type your message... (Shift+Enter for new line)"
                spellcheck="true"
            ></textarea>
            <div id="chat-input-actions">
                <div id="typing-indicator" style="display: none;">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
                <button id="send-message-btn" class="primary-btn">
                    <span class="codicon codicon-send"></span> Send
                </button>
            </div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    dispose(): void {
        this._isDisposed = true;
        if (this._webviewView) {
            this._webviewView.dispose();
            this._webviewView = undefined;
        }
    }
}