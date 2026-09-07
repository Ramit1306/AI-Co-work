import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { logger } from './logger';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

export interface FileInfo {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    extension: string;
    modifiedAt: Date;
    createdAt: Date;
}

export interface SearchOptions {
    pattern?: string;
    excludePatterns?: string[];
    maxResults?: number;
    includeHidden?: boolean;
}

export class FileUtils {
    private static readonly MAX_FILE_SIZE = 1024 * 1024 * 5; // 5MB

    /**
     * Reads a file as text with proper encoding
     */
    static async readFileText(uri: vscode.Uri): Promise<string> {
        try {
            // Check if file exists
            await this.ensureFileExists(uri);
            
            // Check file size
            const stats = await stat(uri.fsPath);
            if (stats.size > this.MAX_FILE_SIZE) {
                throw new Error(`File too large: ${stats.size} bytes (max: ${this.MAX_FILE_SIZE})`);
            }

            // Try using VS Code's API first
            try {
                const document = await vscode.workspace.openTextDocument(uri);
                return document.getText();
            } catch {
                // Fallback to direct file read
                const buffer = await readFile(uri.fsPath);
                return buffer.toString('utf8');
            }
        } catch (error) {
            logger.error(`Failed to read file: ${uri.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Writes content to a file
     */
    static async writeFileText(uri: vscode.Uri, content: string): Promise<void> {
        try {
            // Ensure directory exists
            await this.ensureDirectoryExists(uri);
            
            // Write using VS Code's API if possible
            try {
                const edit = new vscode.WorkspaceEdit();
                const document = await vscode.workspace.openTextDocument(uri);
                const range = new vscode.Range(
                    new vscode.Position(0, 0),
                    document.lineAt(document.lineCount - 1).range.end
                );
                edit.replace(uri, range, content);
                await vscode.workspace.applyEdit(edit);
                
                // Save the document
                const savedDocument = await vscode.workspace.openTextDocument(uri);
                await savedDocument.save();
            } catch {
                // Fallback to direct file write
                await writeFile(uri.fsPath, content, 'utf8');
            }
            
            logger.debug(`File written: ${uri.fsPath}`);
        } catch (error) {
            logger.error(`Failed to write file: ${uri.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Appends content to a file
     */
    static async appendToFile(uri: vscode.Uri, content: string): Promise<void> {
        try {
            await this.ensureDirectoryExists(uri);
            
            const existingContent = await this.fileExists(uri) 
                ? await this.readFileText(uri) 
                : '';
            
            await this.writeFileText(uri, existingContent + content);
        } catch (error) {
            logger.error(`Failed to append to file: ${uri.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Checks if a file exists
     */
    static async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await access(uri.fsPath, fs.constants.F_OK);
            const stats = await stat(uri.fsPath);
            return stats.isFile();
        } catch {
            return false;
        }
    }

    /**
     * Checks if a directory exists
     */
    static async directoryExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await access(uri.fsPath, fs.constants.F_OK);
            const stats = await stat(uri.fsPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Ensures a file exists, creates it if it doesn't
     */
    static async ensureFileExists(uri: vscode.Uri): Promise<void> {
        if (!await this.fileExists(uri)) {
            await this.ensureDirectoryExists(uri);
            await writeFile(uri.fsPath, '', 'utf8');
        }
    }

    /**
     * Ensures a directory exists, creates it if it doesn't
     */
    static async ensureDirectoryExists(uri: vscode.Uri): Promise<void> {
        const dirPath = path.dirname(uri.fsPath);
        if (!await this.directoryExists(vscode.Uri.file(dirPath))) {
            await mkdir(dirPath, { recursive: true });
        }
    }

    /**
     * Deletes a file
     */
    static async deleteFile(uri: vscode.Uri): Promise<void> {
        try {
            if (await this.fileExists(uri)) {
                await unlink(uri.fsPath);
                logger.debug(`File deleted: ${uri.fsPath}`);
            }
        } catch (error) {
            logger.error(`Failed to delete file: ${uri.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Deletes a directory (empty)
     */
    static async deleteDirectory(uri: vscode.Uri): Promise<void> {
        try {
            if (await this.directoryExists(uri)) {
                await rmdir(uri.fsPath);
                logger.debug(`Directory deleted: ${uri.fsPath}`);
            }
        } catch (error) {
            logger.error(`Failed to delete directory: ${uri.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Gets file information
     */
    static async getFileInfo(uri: vscode.Uri): Promise<FileInfo | null> {
        try {
            const stats = await stat(uri.fsPath);
            const name = path.basename(uri.fsPath);
            
            return {
                name,
                path: uri.fsPath,
                size: stats.size,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                extension: path.extname(uri.fsPath),
                modifiedAt: stats.mtime,
                createdAt: stats.birthtime
            };
        } catch {
            return null;
        }
    }

    /**
     * Lists files in a directory
     */
    static async listDirectory(
        uri: vscode.Uri,
        options: SearchOptions = {}
    ): Promise<FileInfo[]> {
        try {
            if (!await this.directoryExists(uri)) {
                return [];
            }

            const files = await readdir(uri.fsPath);
            const result: FileInfo[] = [];
            const maxResults = options.maxResults || 100;

            for (const file of files) {
                // Skip hidden files if not included
                if (!options.includeHidden && file.startsWith('.')) {
                    continue;
                }

                const filePath = path.join(uri.fsPath, file);
                const fileUri = vscode.Uri.file(filePath);
                const info = await this.getFileInfo(fileUri);
                
                if (info) {
                    // Apply pattern filter
                    if (options.pattern) {
                        const regex = new RegExp(options.pattern);
                        if (!regex.test(info.name)) {
                            continue;
                        }
                    }

                    // Apply exclude patterns
                    if (options.excludePatterns) {
                        let excluded = false;
                        for (const pattern of options.excludePatterns) {
                            const regex = new RegExp(pattern);
                            if (regex.test(info.name)) {
                                excluded = true;
                                break;
                            }
                        }
                        if (excluded) {
                            continue;
                        }
                    }

                    result.push(info);
                    if (result.length >= maxResults) {
                        break;
                    }
                }
            }

            return result.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            logger.error(`Failed to list directory: ${uri.fsPath}`, error);
            return [];
        }
    }

    /**
     * Gets the workspace root path
     */
    static getWorkspaceRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders?.[0]?.uri.fsPath;
    }

    /**
     * Resolves a relative path to an absolute URI
     */
    static resolvePath(relativePath: string): vscode.Uri {
        const root = this.getWorkspaceRoot();
        if (!root) {
            throw new Error('No workspace folder open');
        }
        return vscode.Uri.file(path.resolve(root, relativePath));
    }

    /**
     * Gets the relative path from workspace root
     */
    static getRelativePath(absolutePath: string): string {
        const root = this.getWorkspaceRoot();
        if (!root) {
            return absolutePath;
        }
        return path.relative(root, absolutePath);
    }

    /**
     * Checks if a path is within the workspace
     */
    static isInWorkspace(uri: vscode.Uri): boolean {
        const root = this.getWorkspaceRoot();
        if (!root) {
            return false;
        }
        const relative = path.relative(root, uri.fsPath);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    /**
     * Copies a file
     */
    static async copyFile(source: vscode.Uri, destination: vscode.Uri): Promise<void> {
        try {
            const content = await this.readFileText(source);
            await this.writeFileText(destination, content);
            logger.debug(`File copied: ${source.fsPath} -> ${destination.fsPath}`);
        } catch (error) {
            logger.error(`Failed to copy file: ${source.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Moves (renames) a file
     */
    static async moveFile(source: vscode.Uri, destination: vscode.Uri): Promise<void> {
        try {
            await this.copyFile(source, destination);
            await this.deleteFile(source);
            logger.debug(`File moved: ${source.fsPath} -> ${destination.fsPath}`);
        } catch (error) {
            logger.error(`Failed to move file: ${source.fsPath}`, error);
            throw error;
        }
    }

    /**
     * Gets the extension of a file
     */
    static getFileExtension(uri: vscode.Uri): string {
        return path.extname(uri.fsPath).toLowerCase();
    }

    /**
     * Gets the file name without extension
     */
    static getFileNameWithoutExtension(uri: vscode.Uri): string {
        const name = path.basename(uri.fsPath);
        const ext = path.extname(name);
        return name.substring(0, name.length - ext.length);
    }

    /**
     * Sanitizes a file path for safe use
     */
    static sanitizePath(filePath: string): string {
        // Remove any path traversal attempts
        const sanitized = path.normalize(filePath)
            .replace(/\.\./g, '')
            .replace(/\/\/+/g, '/');
            
        return sanitized;
    }

    /**
     * Checks if a file is readable
     */
    static async isReadable(uri: vscode.Uri): Promise<boolean> {
        try {
            await access(uri.fsPath, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks if a file is writable
     */
    static async isWritable(uri: vscode.Uri): Promise<boolean> {
        try {
            await access(uri.fsPath, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }
}