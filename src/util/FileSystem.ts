import { DataAdapter, normalizePath } from 'obsidian';

/**
 * Normalizza il path gestendo correttamente gli array di path
 */
function toPath(pathArray: string[]): string {
	return normalizePath(pathArray.join('/'));
}

/**
 * Restituisce l'ultimo segmento del path (nome file)
 */
function getBasename(path: string): string {
    const parts = normalizePath(path).split('/');
    return parts[parts.length - 1];
}

/**
 * Returns all files in this directory. Could be used with placeholder /*\/ for all paths or /* for all files that match the pattern.
 * @param adapter DataAdapter to use for file system operations
 * @param path Path to check for files
 * @returns a promise resolving to an array of file names
 */
export async function getAllFiles(adapter: DataAdapter, path: string[]): Promise<string[]> {
	let pathSections: string[] = [];
	let files: string[] = [];

	const fullPath = path.join('/');

	// Check path contains path placeholder
	if (fullPath.includes(`/*/`)) {
		pathSections = fullPath.split(`/*/`);

		if (pathSections.length > 0) {
            const basePath = normalizePath(pathSections[0] || '/');
			if (!(await adapter.exists(basePath))) {
				console.warn(`The path section does not exist! PathSections: ${basePath}`);
				return files;
			}
            
            const stat = await adapter.stat(basePath);
			if (stat?.type !== 'folder') {
				console.warn(`The path section is a file and is not inserted, does not match the pattern (/*/)! PathSections: ${basePath}`);
				return files;
			}

			// Get existing paths for placeholders
			const pathContent = await adapter.list(basePath);

			// Add all combined files
            for (const folder of pathContent.folders) {
                const joinedPath = [folder, ...pathSections.slice(1)].join('/');
                const subFiles = await getAllFiles(adapter, [joinedPath]);
                files = files.concat(subFiles);
            }
		}
	}
	// Check path contains file placeholder
	else if (fullPath.endsWith(`/*`)) {
		pathSections = fullPath.split(`/*`);

		if (pathSections.length > 0) {
            const basePath = normalizePath(pathSections[0] || '/');
			if (!(await adapter.exists(basePath))) {
				console.warn(`The path section does not exist! PathSections: ${basePath}`);
				return files;
			}
            const stat = await adapter.stat(basePath);
			if (stat?.type !== 'folder') {
				console.warn(`The path section is a file and is not inserted, does not match the pattern (/*)! PathSections: ${basePath}`);
				return files;
			}
			const pathContent = await adapter.list(basePath);
            for (const file of pathContent.files) {
                if (!FILE_IGNORE_LIST.includes(getBasename(file))) {
                    files.push(file);
                }
            }
		}
	}
	// Path is file
	else {
        const p = normalizePath(fullPath);
        if (await adapter.exists(p)) {
            const stat = await adapter.stat(p);
            if (stat?.type === 'file' && !FILE_IGNORE_LIST.includes(getBasename(p))) {
                files.push(p);
            }
        }
	}
	return files;
}

/**
 * Returns all subpaths in this directory. Could be used with placeholder /*\/ for all paths that match the pattern.
 * @param adapter DataAdapter to use for file system operations
 * @param path Path to check for subpaths
 * @returns a promise resolving to an array of path names
 */
export async function getAllSubPaths(adapter: DataAdapter, path: string[]): Promise<string[]> {
	let pathSections: string[] = [];
	let paths: string[] = [];

    const fullPath = path.join('/');

	// Check path contains placeholder
	if (fullPath.includes(`/*/`)) {
		pathSections = fullPath.split(`/*/`);

		if (pathSections.length > 0) {
            const basePath = normalizePath(pathSections[0] || '/');
			if (!(await adapter.exists(basePath))) {
				console.warn(`The path section does not exist! PathSections: ${basePath}`);
				return paths;
			}
            const stat = await adapter.stat(basePath);
			if (stat?.type !== 'folder') {
				console.warn(`The path section is a file and is not inserted, does not match the pattern (/*/)! PathSections: ${basePath}`);
				return paths;
			}

			// Get existing paths for placeholder
			const pathContent = await adapter.list(basePath);

			// Add all combined paths
            for (const folder of pathContent.folders) {
				const joinedPath = [folder, ...pathSections.slice(1)].join('/');
				const subPaths = await getAllSubPaths(adapter, [joinedPath]);
                paths = paths.concat(subPaths);
            }
		}
	}
	// Path doesn't exist
	else if (!(await adapter.exists(normalizePath(fullPath)))) {
		return [];
	}
	// Get subpath in path
	else {
        const listed = await adapter.list(normalizePath(fullPath));
        paths = listed.folders;
	}
	return paths;
}

/**
 * Compares to files and make them in both directories equal.
 * @param adapter DataAdapter to use for file system operations
 * @param sourcePath The source file
 * @param targetPath The target file
 */
export async function keepNewestFile(adapter: DataAdapter, sourcePath: string[], targetPath: string[]) {
	const sourceFile = toPath(sourcePath);
	const targetFile = toPath(targetPath);

	// Keep newest file
	const sourceExist = await adapter.exists(sourceFile);
	const targetExist = await adapter.exists(targetFile);

	if (sourceExist) {
		const sourceStat = await adapter.stat(sourceFile);
		const targetStat = targetExist ? await adapter.stat(targetFile) : null;
		
		if (!targetExist || (sourceStat && targetStat && sourceStat.mtime > targetStat.mtime)) {
			const targetDir = targetFile.substring(0, targetFile.lastIndexOf('/'));
			if (targetDir) {
				await ensurePathExist(adapter, [targetDir]);
			}
			const content = await adapter.readBinary(sourceFile);
			await adapter.writeBinary(targetFile, content);
		} else if (targetExist) {
			const sourceDir = sourceFile.substring(0, sourceFile.lastIndexOf('/'));
			if (sourceDir) {
				await ensurePathExist(adapter, [sourceDir]);
			}
			const content = await adapter.readBinary(targetFile);
			await adapter.writeBinary(sourceFile, content);
		}
	} else if (targetExist) {
		const sourceDir = sourceFile.substring(0, sourceFile.lastIndexOf('/'));
		if (sourceDir) {
			await ensurePathExist(adapter, [sourceDir]);
		}
		const content = await adapter.readBinary(targetFile);
		await adapter.writeBinary(sourceFile, content);
	}
}

/**
 * Copies a file from a source path to a target path
 * @param adapter DataAdapter to use for file system operations
 * @param sourcePath The source file
 * @param targetPath The target file
 */
export async function copyFile(adapter: DataAdapter, sourcePath: string[], targetPath: string[]) {
	const sourceFile = toPath(sourcePath);
	const targetFile = toPath(targetPath);

	// Check source exist
	if (!(await adapter.exists(sourceFile))) {
		throw Error(`Source file does not exist! SourceFile: ${sourceFile}`);
	}

	// Check target path exist
    const targetDir = targetFile.substring(0, targetFile.lastIndexOf('/'));
    if (targetDir) {
	    await ensurePathExist(adapter, [targetDir]);
    }

	// Check source is on ignore list
	if (FILE_IGNORE_LIST.includes(getBasename(sourceFile))) {
		console.warn(`An attempt was made to copy a file that is on the ignore list. File: ${sourceFile}`);
		return;
	}

	// Copy file
    const content = await adapter.readBinary(sourceFile);
	await adapter.writeBinary(targetFile, content);
}

/**
 * Copy recursive Folder Structure
 * @param adapter DataAdapter to use for file system operations
 * @param sourcePath The source path to copy the subfolders/files
 * @param targetPath The target path where to copy the subfolders/files to
 */
export async function copyFolderRecursiveSync(adapter: DataAdapter, sourcePath: string[], targetPath: string[]) {
	const source = toPath(sourcePath);
	const target = toPath(targetPath);

	// Check source is a valid path and exist
	if (!isValidPath([source]) || !(await adapter.exists(source))) {
		throw Error(`Source path does not exist! Path: ${source}`);
	}
	const sourceStat = await adapter.stat(source);
	if (sourceStat?.type !== 'folder') {
		throw Error(`Source path is not a path! Path: ${source}`);
	}

	// Check target is a valid path and ensure exist
	if (!isValidPath([target])) {
		throw Error(`Target path is not a valid path! Path: ${target}`);
	}
	await ensurePathExist(adapter, [target]);
	const targetStat = await adapter.stat(target);
	if (targetStat?.type !== 'folder') {
		throw Error(`Target path is not a path! Path: ${source}`);
	}

	// Files in source
	const list = await adapter.list(source);

	for (const folder of list.folders) {
		const targetFile = target + '/' + getBasename(folder);
		await copyFolderRecursiveSync(adapter, [folder], [targetFile]);
	}
	
	for (const file of list.files) {
		const targetFile = target + '/' + getBasename(file);
		if (FILE_IGNORE_LIST.includes(getBasename(file))) {
			console.warn(`An attempt was made to copy a file that is on the ignore list. File: ${file}`);
			continue;
		}
		const content = await adapter.readBinary(file);
		await adapter.writeBinary(targetFile, content);
	}
}

/**
 * Ensure the path exist if not try to create it.
 * @param adapter DataAdapter to use for file system operations
 * @param path The path to ensure
 */
export async function ensurePathExist(adapter: DataAdapter, path: string[]) {
    const normalized = toPath(path);
    if (!normalized || normalized === '/') return;
    
    const parts = normalized.split('/');
    let currentPath = '';

    for (const part of parts) {
        currentPath = currentPath === '' ? part : `${currentPath}/${part}`;
        if (!(await adapter.exists(currentPath))) {
            await adapter.mkdir(currentPath);
        }
    }
}

/**
 * Check Path is Valid.
 * @param path Path to Check
 * @returns True if is Valid
 */
export function isValidPath(path: string[]) {
	// Check is not an empty string
	if (path.join('/') === '') {
		return false;
	}
	return true;
}

/**
 * Remove recursive Folder Structure
 * @param adapter DataAdapter to use for file system operations
 * @param path The folder to remove
 */
export async function removeDirectoryRecursiveSync(adapter: DataAdapter, path: string[]) {
	const pathS = toPath(path);

	if (await adapter.exists(pathS)) {
        const stat = await adapter.stat(pathS);
		if (stat?.type === 'folder') {
            const list = await adapter.list(pathS);
            for (const folder of list.folders) {
                await removeDirectoryRecursiveSync(adapter, [folder]);
            }
            for (const file of list.files) {
                await adapter.remove(file);
            }
			// Remove the empty directory
			await adapter.rmdir(pathS, true);
		}
		else {
			// Remove file if not directory
			await adapter.remove(pathS);
		}
	}
}

/**
 * Get the absolute path of this vault
 * @returns Returns the Absolute path (DEPRECATED FOR MOBILE: don't use this, use relative paths)
 */
export function getVaultPath() {
	return ''; // Not needed on mobile since adapter uses relative paths!
}

/**
 * Files that generally should not be copied
 */
export const FILE_IGNORE_LIST = [
	'.DS_Store',
];

/**
 * Checks the file content of the file is equal
 * @param adapter DataAdapter to use for file system operations
 * @param file1 File path of first file
 * @param file2 File path of second file
 * @returns Are the files equal
 */
export async function filesEqual(adapter: DataAdapter, file1: string, file2: string): Promise<boolean> {
    try {
        const f1 = await adapter.readBinary(normalizePath(file1));
        const f2 = await adapter.readBinary(normalizePath(file2));
        
        if (f1.byteLength !== f2.byteLength) return false;
        
        const dv1 = new Int8Array(f1);
        const dv2 = new Int8Array(f2);
        for (let i = 0 ; i !== f1.byteLength ; i++) {
            if (dv1[i] !== dv2[i]) return false;
        }
        return true;
    } catch(e) {
        return false;
    }
}