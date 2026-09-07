import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface ContextData {
    context: string;
    symbols: string[];
    imports: string[];
    fileType: string;
    surroundingCode: {
        before: string;
        after: string;
    };
}

export class ContextProvider {
    private readonly MAX_CONTEXT_LINES = 100;
    private readonly MAX_SYMBOLS = 50;

    async collectContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<ContextData | undefined> {
        try {
            const text = document.getText();
            const lines = text.split('\n');
            const lineNumber = position.line;

            // Get context before cursor (up to MAX_CONTEXT_LINES)
            const startLine = Math.max(0, lineNumber - this.MAX_CONTEXT_LINES);
            const contextLines = lines.slice(startLine, lineNumber + 1);
            const context = contextLines.join('\n');

            // Get surrounding code
            const beforeLines = lines.slice(Math.max(0, lineNumber - 10), lineNumber);
            const afterLines = lines.slice(lineNumber + 1, Math.min(lines.length, lineNumber + 11));

            // Extract symbols and imports
            const symbols = await this.extractSymbols(document, position);
            const imports = await this.extractImports(document);

            // Determine file type
            const fileType = this.detectFileType(document.fileName);

            return {
                context,
                symbols: symbols.slice(0, this.MAX_SYMBOLS),
                imports,
                fileType,
                surroundingCode: {
                    before: beforeLines.join('\n'),
                    after: afterLines.join('\n')
                }
            };
        } catch (error) {
            logger.error('Failed to collect context', error);
            return undefined;
        }
    }

    private async extractSymbols(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<string[]> {
        try {
            const symbols: string[] = [];

            // Get document symbols
            const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (documentSymbols) {
                for (const symbol of documentSymbols) {
                    // Add symbol name and type
                    symbols.push(`${symbol.name}:${vscode.SymbolKind[symbol.kind]}`);
                    
                    // Add child symbols
                    if (symbol.children) {
                        for (const child of symbol.children) {
                            // Only add if it's in scope (before cursor position)
                            if (child.range.start.isBefore(position)) {
                                symbols.push(`  ${child.name}:${vscode.SymbolKind[child.kind]}`);
                            }
                        }
                    }
                }
            }

            return symbols;
        } catch (error) {
            logger.debug('Failed to extract symbols', error);
            return [];
        }
    }

    private async extractImports(document: vscode.TextDocument): Promise<string[]> {
        const imports: string[] = [];
        const lines = document.getText().split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            // Detect various import patterns
            if (this.isImportLine(trimmed)) {
                imports.push(trimmed);
            }
        }

        return imports;
    }

    private isImportLine(line: string): boolean {
        const importPatterns = [
            /^import\s+/,
            /^from\s+.*\s+import\s+/,
            /^require\s*\(/,
            /^#include\s+/,
            /^using\s+/,
            /^include\s+/,
            /^#[A-Za-z_][A-Za-z0-9_]*\s+import/
        ];

        return importPatterns.some(pattern => pattern.test(line));
    }

    private detectFileType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        
        const typeMap: Record<string, string> = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascriptreact',
            '.tsx': 'typescriptreact',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.cs': 'csharp',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.less': 'less',
            '.json': 'json',
            '.xml': 'xml',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.toml': 'toml',
            '.md': 'markdown'
        };

        return typeMap[ext] || 'unknown';
    }

    // Additional context helpers
    async getFunctionContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<string | undefined> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols) return undefined;

            // Find the function/method that contains the cursor position
            for (const symbol of symbols) {
                const range = symbol.range;
                if (range.contains(position)) {
                    const text = document.getText(range);
                    return text;
                }
                
                // Check children
                if (symbol.children) {
                    for (const child of symbol.children) {
                        if (child.range.contains(position)) {
                            const text = document.getText(child.range);
                            return text;
                        }
                    }
                }
            }

            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    async getVariableTypes(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<Map<string, string>> {
        const types = new Map<string, string>();
        const text = document.getText();
        const lines = text.split('\n');

        // Simple pattern matching for variable declarations
        const patterns = [
            // JavaScript/TypeScript
            /(?:const|let|var)\s+(\w+)\s*(?::\s*(\w+))?\s*=/,
            // Python
            /(\w+)\s*:\s*(\w+)\s*=/,
            // Java/C#
            /(?:public|private|protected)?\s*(\w+)\s+(\w+)\s*=/,
        ];

        for (let i = 0; i < Math.min(lines.length, position.line + 1); i++) {
            const line = lines[i];
            for (const pattern of patterns) {
                const match = line.match(pattern);
                if (match) {
                    const varName = match[1];
                    const varType = match[2] || 'unknown';
                    types.set(varName, varType);
                }
            }
        }

        return types;
    }
}