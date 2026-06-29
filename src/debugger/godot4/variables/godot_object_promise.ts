import { GodotVariable } from "../../debug_runtime";

export interface GodotObject {
	godot_id: bigint;
	type: string;
	sub_values: GodotVariable[];
}

/**
 * A promise that resolves when Godot Server responds.
 *
 * This promise is used to handle the asynchronous nature of requesting a Godot object.
 * It is used as a placeholder until the actual object is received.
 *
 * When the response is received from the server, the promise is resolved with the response.
 * If the response is not received within a certain time, the promise is rejected with an error.
 */
export class GodotResponsePromise<T> {
	private _resolve!: (value: T | PromiseLike<T>) => void;
	private _reject!: (reason?: any) => void;
	public promise: Promise<T>;
	private timeoutId?: NodeJS.Timeout;

	constructor(timeoutMs?: number) {
		this.promise = new Promise<T>((resolve_arg, reject_arg) => {
			this._resolve = resolve_arg;
			this._reject = reject_arg;

			if (timeoutMs !== undefined) {
				this.timeoutId = setTimeout(() => {
					reject_arg(new Error("GodotResponsePromise timed out"));
				}, timeoutMs);
			}
		});
	}

	resolve(value: T) {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = undefined;
		}
		this._resolve(value);
	}

	reject(reason: Error) {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = undefined;
		}
		this._reject(reason);
	}
}
