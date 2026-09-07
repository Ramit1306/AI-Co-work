import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface GhostTextOptions {
    maxLines?: number;
    preserveIndentation?: boolean;
    showConfidence?: boolean;
}

export class GhostTextRenderer {
    private options: GhostTextOptions = {
        maxLines: 10,
        preserveIndentation: true,
        showConfidence: false
    };

    constructor(options?: GhostTextOptions) {
        this.options = { ...this.options, ...options };
    }

    generateGhostText(
        completion: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): string {
        try {
            // Clean and format the completion
            let ghostText = this.cleanCompletion(completion, document, position);

            // Limit number of lines
            ghostText = this.limitLines(ghostText);

            // Preserve indentation
            if (this.options.preserveIndentation) {
                ghostText = this.preserveIndentation(ghostText, document, position);
            }

            // Remove duplicates (text already present at cursor position)
            ghostText = this.removeDuplicates(ghostText, document, position);

            return ghostText;
        } catch (error) {
            logger.error('Failed to generate ghost text', error);
            return completion; // Return original on error
        }
    }

    private cleanCompletion(
        completion: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): string {
        // Remove trailing whitespace
        let cleaned = completion.replace(/\s+$/, '');

        // Ensure it ends with proper line ending
        const currentLine = document.lineAt(position.line).text;
        const currentIndentation = this.getIndentation(currentLine);
        
        // Check if completion starts with indentation
        if (cleaned.startsWith(currentIndentation)) {
            cleaned = cleaned.substring(currentIndentation.length);
        }

        // Remove duplicate parts already in document
        const lines = cleaned.split('\n');
        const filteredLines = lines.filter((line, index) => {
            if (index === 0) {
                const currentLineText = document.lineAt(position.line).text;
                const cursorText = currentLineText.substring(position.character);
                if (cursorText && line.startsWith(cursorText)) {
                    return false;
                }
            }
            return true;
        });

        return filteredLines.join('\n');
    }

    private limitLines(text: string): string {
        const lines = text.split('\n');
        if (lines.length > (this.options.maxLines || 10)) {
            return lines.slice(0, this.options.maxLines).join('\n') + '\n...';
        }
        return text;
    }

    private preserveIndentation(
        text: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): string {
        const currentLine = document.lineAt(position.line).text;
        const indentation = this.getIndentation(currentLine);
        
        const lines = text.split('\n');
        const indentedLines = lines.map((line, index) => {
            if (index === 0) {
                // First line uses current indentation
                const currentIndent = this.getIndentation(line);
                if (!line.trim()) {
                    return indentation;
                }
                return indentation + line.trim();
            } else {
                // Subsequent lines preserve relative indentation
                const relativeIndent = this.getIndentation(line);
                if (!line.trim()) {
                    return indentation + ' '.repeat(relativeIndent.length);
                }
                // Remove existing indentation and apply relative + base
                const trimmed = line.trimStart();
                return indentation + ' '.repeat(relativeIndent.length) + trimmed;
            }
        });

        return indentedLines.join('\n');
    }

    private removeDuplicates(
        text: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): string {
        const lines = text.split('\n');
        const result: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nextLinePos = new vscode.Position(position.line + i, 0);
            
            if (nextLinePos.line < document.lineCount) {
                const existingLine = document.lineAt(nextLinePos.line).text;
                const trimmedExisting = existingLine.trim();
                const trimmedNew = line.trim();
                
                // Skip if line already exists exactly
                if (trimmedExisting === trimmedNew) {
                    continue;
                }
                
                // Skip if new line is just a continuation of existing
                if (trimmedExisting.startsWith(trimmedNew)) {
                    continue;
                }
            }
            
            result.push(line);
        }

        return result.join('\n');
    }

    private getIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    // Format ghost text with VS Code's ghost text styling
    formatForDisplay(text: string): string {
        // VS Code will handle the ghost text styling
        // We just need to ensure the text is clean
        return text.trimEnd();
    }

    // Generate preview for tooltip
    generatePreview(text: string, maxLength: number = 100): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }

    // Check if ghost text is valid
    isValidGhostText(text: string): boolean {
        if (!text || text.trim().length === 0) {
            return false;
        }
        // Too long (> 1000 characters)
        if (text.length > 1000) {
            return false;
        }
        // Too many lines (> 20)
        if (text.split('\n').length > 20) {
            return false;
        }
        return true;
    }

    // Create ghost text with metadata
    createGhostTextWithMetadata(
        text: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): { text: string; range: vscode.Range; metadata: any } {
        const cleanText = this.generateGhostText(text, document, position);
        
        return {
            text: cleanText,
            range: new vscode.Range(position, position),
            metadata: {
                generatedAt: Date.now(),
                lineCount: cleanText.split('\n').length,
                charCount: cleanText.length,
                fileType: document.languageId
            }
        };
    }
}