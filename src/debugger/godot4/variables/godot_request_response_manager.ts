import { Command } from "../server_controller";
import { GodotResponsePromise } from "./godot_object_promise";

type MatchResult<T> =
  | { handled: true; value: T }
  | { handled: false };

type ResponseMatcher<T> = (response: Command) => MatchResult<T>;

type Waiter<T> = {
	responseMatcher: ResponseMatcher<T>;
	promise: GodotResponsePromise<T>;
};

/**
 * Manages asynchronous request-response handling between the client and Godot.
 *
 * This class allows consumers to register promises that wait for specific
 * server responses (identified by a command name and matched via a custom matcher).
 * When a response arrives, the manager resolves the first matching pending promise.
 *
 * Internally, multiple waiters can be registered per response command name,
 * and each waiter provides a matcher function to determine whether an incoming
 * command satisfies its conditions.
 */
export class GodotRequestResponseManager {
	private godotResponsePromises: Map</*responseCommandName:*/ string, Waiter<any>[]> = new Map();

	/**
	 * Registers a new promise (waiter) for a specific server response.
	 *
	 * @param responseCommandName - The name of the response command to listen for.
	 * @param responseMatcher - A callback that inspects an incoming command and determines whether it matches.
	 * 												  If matched, it returns `{ handled: true, value: T }`.
	 * @returns A promise that resolves with the matched response value.
	 *
	 * note: {@link resolve} should be called by `{@link ServerController.handle_command}` in order to resolve the promise
	*/
	public get_server_response<T>(responseCommandName: string, responseMatcher: ResponseMatcher<T>, timeoutMs?: number): Promise<T> {
		const godotPromise = new GodotResponsePromise<T>(timeoutMs);

		const list = this.godotResponsePromises.get(responseCommandName) ?? [];
		list.push({ responseMatcher, promise: godotPromise });
		this.godotResponsePromises.set(responseCommandName, list);

		return godotPromise.promise;
	}
	
	resolve(responseCommandName: string, command: Command, delete_matching_promise: boolean) {
		const responsePromises = this.godotResponsePromises.get(responseCommandName);
		if (!responsePromises) {
			throw new Error(`No waiter found for command ${responseCommandName}`);
		}

		let waiterIndex = -1;
		let matchedWaiter: Waiter<any> | undefined;
		let waiterValue: any;

		for (let i = 0; i < responsePromises.length; i++) {
			const waiter = responsePromises[i];
			const result = waiter.responseMatcher(command);
			if (result.handled) {
				waiterIndex = i;
				matchedWaiter = waiter;
				waiterValue = result.value;
				break; // use first match
			}
		}

		if (!matchedWaiter) {
			throw new Error(`No waiter found for command ${responseCommandName} which matches command parameters`);
		}

		matchedWaiter.promise.resolve(waiterValue);

		if (delete_matching_promise) {
			responsePromises.splice(waiterIndex, 1);
		}
	}
}
