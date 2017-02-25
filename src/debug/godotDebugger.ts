import {
	DebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Event,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import * as fs from 'fs';
import * as path from 'path';
const cmd = require('node-cmd');

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	godot: string;
	projectDir: string;
	runWithEditor: boolean;
	params: string[];
}

class GodotDebugSession extends DebugSession {

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super();
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());

		// This debug adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code to use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = true;

		// make VS Code to show a 'step back' button
		response.body.supportsStepBack = true;

		this.log("initializeRequest");
		this.log_err("initializeRequest");
		this.log_console("initializeRequest");
		this.sendResponse(response);
	}

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
		for(let key of Object.keys(args))
			this.log(`${key} : ${args[key]}`);
		let workspaceValid = false
        if(args.godot && fs.existsSync(args.godot) && fs.statSync(args.godot).isFile() ) {
			if(args.projectDir && fs.existsSync(args.projectDir) && fs.statSync(args.projectDir).isDirectory() ) {
				let cfg = path.join(args.projectDir, "engine.cfg");
				if( fs.existsSync(cfg) && fs.statSync(cfg).isFile())
					workspaceValid = true;
			}
		}
		if(workspaceValid) {
			let params = `-path ${args.projectDir} `;
			if(args.runWithEditor)
				params += "-e";
			if(args.params) {
				for(let p of args.params)
					params += " " + p;
			}
			let cmdcontent = `${args.godot} ${params}`;
			this.log(cmdcontent)
			//  TODO: print outputs in terminal console
			cmd.run(cmdcontent);
			this.sendEvent(new TerminatedEvent());
		}
		else {
			this.log_err("Invalidate path of projectDir or godot:");
			this.log_err(JSON.stringify(args, null, '\t'));
			this.sendEvent(new TerminatedEvent());
		}
	}
	

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

		// return the default thread
		response.body = {
			threads: [
				new Thread(GodotDebugSession.THREAD_ID, "thread 1")
			]
		};
		this.sendResponse(response);
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.sendEvent(new TerminatedEvent());
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) : void {
		this.sendResponse(response);
 	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.sendResponse(response);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		this.sendResponse(response);
	}

	/**
	 * Fire StoppedEvent if line is not empty.
	 */
	private fireStepEvent(response: DebugProtocol.Response, ln: number): boolean {
		return false;
	}

	private log(msg: string) {
		const e = new OutputEvent(msg, "stdout");
		this.sendEvent(e);
	}
	private log_err(msg: string) {
		const e = new OutputEvent(msg, "stderr");
		this.sendEvent(e);
	}
	private log_console(msg: string) {
		const e = new OutputEvent(msg, "console");
		this.sendEvent(e);
	}
}

DebugSession.run(GodotDebugSession);
