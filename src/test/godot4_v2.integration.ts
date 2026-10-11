import { ok, strictEqual } from "node:assert";
import * as vscode from "vscode";

async function retry<T>(operation: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
	const deadline = performance.now() + timeoutMs;
	let lastError: unknown;
	while (performance.now() < deadline) {
		try { return await operation(); } catch (error) { lastError = error; }
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw lastError ?? new Error("Timed out waiting for Godot debugger");
}

suite("Godot 4.6.2 debugger protocol v2 DAP", () => {
	test("pairs channels, pages variables, and acknowledges 20 steps", async () => {
		const extension = vscode.extensions.getExtension("geequlim.godot-tools");
		ok(extension);
		await extension.activate();
		const folder = vscode.workspace.workspaceFolders?.[0];
		ok(folder);
		const executable = process.env.GODOT4_V2_PATH;
		ok(executable, "GODOT4_V2_PATH is required");
		const started = await vscode.debug.startDebugging(folder, {
			name: "Godot 4 protocol v2 integration",
			type: "godot",
			request: "launch",
			project: folder.uri.fsPath,
			editor_path: executable,
			debug_protocol_v2: true,
			address: "127.0.0.1",
			port: -1,
			additional_options: "--headless --script main.gd",
		});
		ok(started);
		const session = await retry(async () => {
			const active = vscode.debug.activeDebugSession;
			if (!active) throw new Error("Debug session did not start");
			const stack = await active.customRequest("stackTrace", { threadId: 0, startFrame: 0, levels: 20 });
			if (!stack.stackFrames?.length) throw new Error("No stop yet");
			return active;
		}, 30_000);
		try {
			const stack = await session.customRequest("stackTrace", { threadId: 0, startFrame: 0, levels: 20 });
			ok(stack.stackFrames[0].source.path.endsWith("main.gd"));
			const scopes = await session.customRequest("scopes", { frameId: stack.stackFrames[0].id });
			const locals = scopes.scopes.find((scope: any) => scope.name === "Locals");
			ok(locals);
			const page = await session.customRequest("variables", { variablesReference: locals.variablesReference, start: 0, count: 100 });
			const array = page.variables.find((variable: any) => variable.name === "huge_array");
			ok(array?.variablesReference > 0);
			const arrayPage = await session.customRequest("variables", { variablesReference: array.variablesReference, start: 100, count: 100 });
			strictEqual(arrayPage.variables.length, 100);
			strictEqual(arrayPage.variables[0].value, "100");

			for (let index = 0; index < 20; index++) {
				await retry(async () => session.customRequest("next", { threadId: 0 }), 5000);
				await retry(async () => {
					const nextStack = await session.customRequest("stackTrace", { threadId: 0, startFrame: 0, levels: 1 });
					if (!nextStack.stackFrames?.length) throw new Error("No stop after step");
					return nextStack;
				}, 5000);
			}
			const breakpoints = await session.customRequest("setBreakpoints", {
				source: { path: stack.stackFrames[0].source.path },
				lines: [12],
				breakpoints: [{ line: 12 }],
			});
			ok(breakpoints.breakpoints?.[0]?.verified);
			await session.customRequest("continue", { threadId: 0 });
			await retry(async () => {
				const atBreakpoint = await session.customRequest("stackTrace", { threadId: 0, startFrame: 0, levels: 1 });
				strictEqual(atBreakpoint.stackFrames?.[0]?.line, 12);
			}, 5000);
		} finally {
			await vscode.debug.stopDebugging(session);
		}
	});
});
