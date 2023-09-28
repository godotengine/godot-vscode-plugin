/* 
Copied from https://github.com/craigwardman/subspawn
Copyright (c) 2022 Craig Wardman

I had to vendor this library to fix the API in a couple places.
*/

import { ChildProcess, execSync, spawn, ExecSyncOptions, SpawnOptions } from 'child_process';

interface dictionaryOfStringChildProcessArray {
	[key: string]: ChildProcess[];
}
const children: dictionaryOfStringChildProcessArray = {};

export const killSubProcesses = function (owner: string) {
	console.log(`killing ${owner} child processes (${children[owner].length})`);

	children[owner].forEach((c) => {
		try {
			if (c.pid) {
				if (process.platform === 'win32') {
					execSync(`taskkill /pid ${c.pid} /T /F`);
				} else {
					process.kill(-c.pid);
				}
			}
		} catch { }
	});
};

process.on('exit', () => Object.keys(children).forEach((owner) => killSubProcesses(owner)));
function gracefulExitHandler() {
	console.log('Handling termination signal to gracefully exit process')
	process.exit()
}

process.on('SIGINT', gracefulExitHandler)
process.on('SIGTERM', gracefulExitHandler)
process.on('SIGQUIT', gracefulExitHandler)

const spawnSubProcess = (owner: string, command: string, options?: SpawnOptions) => {
	const childProcess = spawn(command, options);

	children[owner] = children[owner] || [];
	children[owner].push(childProcess);

	return childProcess;
};

const spawnSubProcessOnWindows = (owner: string, command: string, options?: SpawnOptions) => {
	const childProcess = spawn(command, options);

	children[owner] = children[owner] || [];
	children[owner].push(childProcess);

	return childProcess;
};

export const subProcess = (owner: string, command: string, options?: SpawnOptions) => {
	if (process.platform === 'win32') {
		return spawnSubProcessOnWindows(owner, command, options);
	} else {
		return spawnSubProcess(owner, command, options);
	}
};

export const subProcessSync = (command: string, options?: ExecSyncOptions) => {
	return execSync(command, options);
};
