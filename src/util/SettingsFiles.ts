import { DataAdapter, normalizePath } from 'obsidian';
import { PROFILE_OPTIONS_MAP, ProfileOptions } from '../settings/SettingsInterface';
import { ensurePathExist, filesEqual, getAllFiles, isValidPath } from './FileSystem';

/**
 * Normalizza il path gestendo correttamente gli array di path
 */
function toPath(pathArray: string[]): string {
	return normalizePath(pathArray.join('/'));
}

/**
 * Saves the profile options data to the path.
 * @param adapter The DataAdapter for file system access
 * @param profile The profile to save
 * @param profilesPath The path where the profile should be saved
 */
export async function saveProfileOptions(adapter: DataAdapter, profile: ProfileOptions, profilesPath: string) {
	try {
		// Ensure is valid profile
		if (!profile) {
			throw Error(`Can't save undefined profile! Profile: ${JSON.stringify(profile)}`);
		}

		// Ensure is valid path
		if (!isValidPath([profilesPath, profile.name])) {
			throw Error(`Invalid path received! ProfilesPath: ${profilesPath}`);
		}

		// Ensure path exist
		await ensurePathExist(adapter, [profilesPath, profile.name]);

		// Write profile settings to path
		const file = toPath([profilesPath, profile.name, 'profile.json']);
		const profileSettings = JSON.stringify(profile, null, 2);
		await adapter.write(file, profileSettings);
	}
	catch (e) {
		(e as Error).message = 'Failed to save profile data! ' + (e as Error).message;
		throw e;
	}
}

/**
 * Saves the profiles options data to the path.
 * @param adapter The DataAdapter for file system access
 * @param profilesList The profiles to save
 * @param profilesPath The path where the profiles should be saved
 */
export async function saveProfilesOptions(adapter: DataAdapter, profilesList: ProfileOptions[], profilesPath: string) {
	try {
        for (const profile of profilesList) {
			// Ensure is valid profile
			if (!profile) {
				throw Error(`Can't save undefined profile! Profile: ${JSON.stringify(profile)}`);
			}

			// Ensure is valid path
			if (!isValidPath([profilesPath, profile.name])) {
				throw Error(`Invalid path received! ProfilesPath: ${profilesPath}`);
			}

			// Ensure path exist
			await ensurePathExist(adapter, [profilesPath, profile.name]);

			// Write profile settings to path
			const file = toPath([profilesPath, profile.name, 'profile.json']);
			const profileSettings = JSON.stringify(profile, null, 2);
			await adapter.write(file, profileSettings);
		}
	}
	catch (e) {
		(e as Error).message = 'Failed to save profiles data! ' + (e as Error).message + ` ProfilesList: ${JSON.stringify(profilesList)}`;
		throw e;
	}
}

/**
 * Loads the profile options data form the path
 * @param adapter The DataAdapter for file system access
 * @param profile The profile to load name is requierd
 * @param profilesPath The path where the profiles are saved
 */
export async function loadProfileOptions(adapter: DataAdapter, profile: Partial<ProfileOptions>, profilesPath: string): Promise<ProfileOptions> {
	try {
		if (!profile.name) {
			throw Error(`Name is requierd! Profile: ${JSON.stringify(profile)}`);
		}

		// Search for all profiles existing
		const file = toPath([profilesPath, profile.name, 'profile.json']);
		let profileData: ProfileOptions | undefined = undefined;

		if (!(await adapter.exists(file))) {
			throw Error(`Path does not exist! Path: ${file}`);
		}

        const stat = await adapter.stat(file);
		if (stat?.type !== 'file') {
			throw Error(`The path does not point to a file. Path: ${file}`);
		}

		// Read profile settings
		const data = await adapter.read(file);
		profileData = JSON.parse(data);

		if (!profileData) {
			throw Error('Failed to read profile from file!');
		}

		// Convert date string to date
		profileData.modifiedAt = new Date(profileData.modifiedAt);

		return profileData;
	}
	catch (e) {
		(e as Error).message = 'Failed to load profile data! ' + (e as Error).message;
		throw e;
	}
}

/**
 * Loads the profiles options data form the path
 * @param adapter The DataAdapter for file system access
 * @param profilesPath The path where the profiles are saved
 */
export async function loadProfilesOptions(adapter: DataAdapter, profilesPath: string): Promise<ProfileOptions[]> {
	try {
		// Search for all profiles existing
		const files = await getAllFiles(adapter, [profilesPath, `/*/profile.json`]);
		const profilesList: ProfileOptions[] = [];

		// Read profile settings
		for (const file of files) {
			if (!(await adapter.exists(file))) {
				throw Error(`Path does not exist! Path: ${file}`);
			}

            const stat = await adapter.stat(file);
			if (stat?.type !== 'file') {
				throw Error(`The path does not point to a file. Path: ${file}`);
			}
			const data = await adapter.read(file);
			const profileData = JSON.parse(data);

			if (!profileData) {
				throw Error('Failed to read profile from file!');
			}

			// Convert date string to date
			profileData.modifiedAt = new Date(profileData.modifiedAt);

			profilesList.push(profileData);
		}
		return profilesList;
	}
	catch (e) {
		(e as Error).message = 'Failed to load profiles data! ' + (e as Error).message;
		throw e;
	}
}

/**
 * Returns all setting files if they are enabeled in profile
 * @param profile The profile for which the files will be returned
 * @returns an array of file names
 */
export function getConfigFilesList(profile: ProfileOptions): string[] {
	const files = [];
	for (const key in profile) {
		if (Object.prototype.hasOwnProperty.call(profile, key)) {
			const value = profile[key as keyof ProfileOptions];
			if (typeof value === 'boolean' && key !== 'enabled' && value) {
				const file = PROFILE_OPTIONS_MAP[key as keyof ProfileOptions]?.file;
				if (file && typeof file === 'string') {
					files.push(normalizePath(file));
				}
				else if (file && Array.isArray(file)) {
					file.forEach(f => {
						files.push(normalizePath(f));
					});
				}
			}
		}
	}

	return files;
}

/**
 * Returns all files without placeholder
 * @param adapter The DataAdapter for file system access
 * @param filesList filesList Files list with placeholders
 * @param path Path to fill placeholders
 * @returns The files list without placeholder
 */
export async function getFilesWithoutPlaceholder(adapter: DataAdapter, filesList: string[], path: string[]): Promise<string[]> {
	const files: string[] = [];
	for (const file of filesList) {
		if ((file.includes(`/*/`) || file.includes(`/*`))) {
			const pathVariants = await getAllFiles(adapter, [...path, file]);

			// Trim the start of path
            const suffixVariants = pathVariants.map(value => {
                const parts = value.split('/');
                const fileParts = file.split('/');
                return parts.slice(-fileParts.length).join('/');
            });

			suffixVariants.forEach(value => {
				files.push(value);
			});
		}
		else {
			files.push(file);
		}
	}

	return [...new Set(files)]; // remove duplicates
}

/**
 * Returns all ignore files if they are enabeled in profile
 * @param profile The profile for which the files will be returned
 * @returns an array of file names
 */
export function getIgnoreFilesList(profile: ProfileOptions): string[] {
	const files = [];
	for (const key in profile) {
		if (Object.prototype.hasOwnProperty.call(profile, key)) {
			const value = profile[key as keyof ProfileOptions];
			if (value && typeof value === 'boolean') {
				const file = PROFILE_OPTIONS_MAP[key as keyof ProfileOptions]?.ignore;
				if (file && typeof file === 'string') {
					files.push(normalizePath(file));
				}
				else if (file && Array.isArray(file)) {
					file.forEach(f => {
						files.push(normalizePath(f));
					});
				}
			}
		}
	}

	return files;
}

export function filterIgnoreFilesList(filesList: string[], profile: ProfileOptions): string[] {
	const ignoreFiles = getIgnoreFilesList(profile);
	return filesList.filter((file) => {
		return !ignoreFiles.some(ignore => file === ignore || file.startsWith(ignore + '/'));
	});
}

/**
 * Filter the file list to only include unchanged files
 * @param adapter The DataAdapter for file system access
 * @param filesList Files list to compare
 * @param sourcePath The path to the source file
 * @param targetPath The path to the target file
 * @returns The filtered files list
 */
export async function filterUnchangedFiles(adapter: DataAdapter, filesList: string[], sourcePath: string[], targetPath: string[]): Promise<string[]> {
	const result: string[] = [];
    for (const file of filesList) {
		const sourceFile = toPath([...sourcePath, file]);

		// Check source exist and is file
		if (!(await adapter.exists(sourceFile))) {
			continue;
		}
		const sourceStat = await adapter.stat(sourceFile);
		if (sourceStat?.type !== 'file') {
			continue;
		}
		const targetFile = toPath([...targetPath, file]);

		// Check target don't exist
		if (!(await adapter.exists(targetFile))) {
			continue;
		}
		const targetStat = await adapter.stat(targetFile);

		// Check target is file
		if (targetStat?.type !== 'file') {
			continue;
		}

		// Check file size
		if (sourceStat.size !== targetStat.size) {
			continue;
		}

		if (await filesEqual(adapter, sourceFile, targetFile)) {
            result.push(file);
        }
	}
    return result;
}

/**
 * Filter the file list to only include changed files
 * @param adapter The DataAdapter for file system access
 * @param filesList Files list to compare
 * @param sourcePath The path to the source file
 * @param targetPath The path to the target file
 * @returns The filtered files list
 */
export async function filterChangedFiles(adapter: DataAdapter, filesList: string[], sourcePath: string[], targetPath: string[]): Promise<string[]> {
	const result: string[] = [];
    for (const file of filesList) {
		const sourceFile = toPath([...sourcePath, file]);

		// Check source exist and is file
		if (!(await adapter.exists(sourceFile))) {
			continue;
		}
		const sourceStat = await adapter.stat(sourceFile);

		// Check source is file
		if (sourceStat?.type !== 'file') {
			continue;
		}
		const targetFile = toPath([...targetPath, file]);

		// Check target don't exist
		if (!(await adapter.exists(targetFile))) {
			result.push(file);
            continue;
		}
		const targetStat = await adapter.stat(targetFile);

		// Check target is file
		if (targetStat?.type !== 'file') {
			result.push(file);
            continue;
		}

		// Check file size
		if (sourceStat.size !== targetStat.size) {
			result.push(file);
            continue;
		}

		if (!(await filesEqual(adapter, sourceFile, targetFile))) {
            result.push(file);
        }
	}
    return result;
}

/**
 * Filter the file list to only include the files there are newer in source than in target
 * @param adapter The DataAdapter for file system access
 * @param filesList Files list to compare
 * @param sourcePath The path to the source file
 * @param targetPath The path to the target file
 * @returns The filterd files list
 */
export async function filterNewerFiles(adapter: DataAdapter, filesList: string[], sourcePath: string[], targetPath: string[]): Promise<string[]> {
	const result: string[] = [];
    for(const file of filesList) {
		const sourceFile = toPath([...sourcePath, file]);

		// Check source exist and is file
		if (!(await adapter.exists(sourceFile))) {
			continue;
		}
		const sourceStat = await adapter.stat(sourceFile);
		if (sourceStat?.type !== 'file') {
			continue;
		}
		const targetFile = toPath([...targetPath, file]);

		// Check target don't exist
		if (!(await adapter.exists(targetFile))) {
			result.push(file);
            continue;
		}

		const targetStat = await adapter.stat(targetFile);
		if (sourceStat && targetStat && sourceStat.mtime > targetStat.mtime) {
            result.push(file);
        }
	}
    return result;
}

/**
 * Check the files list contains a changed file
 * @param adapter The DataAdapter for file system access
 * @param filesList Files list to compare
 * @param sourcePath The path to the source file
 * @param targetPath The path to the target file
 * @returns Is there a changed file
 */
export async function containsChangedFiles(adapter: DataAdapter, filesList: string[], sourcePath: string[], targetPath: string[]): Promise<boolean> {
	for(const file of filesList) {
		const sourceFile = toPath([...sourcePath, file]);

		// Check source exist and is file
		if (!(await adapter.exists(sourceFile))) {
			return true;
		}
		const sourceStat = await adapter.stat(sourceFile);
		if (sourceStat?.type !== 'file') {
			return true;
		}
		const targetFile = toPath([...targetPath, file]);

		// Check target don't exist
		if (!(await adapter.exists(targetFile))) {
			continue;
		}
		const targetStat = await adapter.stat(targetFile);

		// Check target is file
		if (targetStat?.type !== 'file') {
			continue;
		}

		// Check file size
		if (sourceStat.size !== targetStat.size) {
			continue;
		}

		if (!(await filesEqual(adapter, sourceFile, targetFile))) {
            return true;
        }
	}
    return false;
}