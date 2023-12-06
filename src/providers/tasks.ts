import * as vscode from "vscode";
import {
	Task,
	TaskProvider,
	TaskScope,
	TaskDefinition,
	ExtensionContext,
} from "vscode";
import { createLogger } from "../utils";

const log = createLogger("providers.tasks");

interface GDTaskDefinition extends TaskDefinition {
	task: string;
	file?: string;
}

export class GDTaskProvider implements TaskProvider {
	constructor(private context: ExtensionContext) {
		context.subscriptions.push(
			vscode.tasks.registerTaskProvider("godot", this),
		);
	}

	public provideTasks() {
		const tasks: Task[] = [];

		const workspaceFolder = vscode.workspace.workspaceFolders[0];
		const taskName = "test";
		const kind: GDTaskDefinition = {
			type: "godot",
			task: taskName,
		};
		const task = new vscode.Task(kind, workspaceFolder, taskName, "godot");
		tasks.push(task);

		return tasks;
	}

	public resolveTask(_task: Task) {
		log.debug("resolveTask", _task);

		return _task;
	}
}
