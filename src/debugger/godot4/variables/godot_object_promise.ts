import { GodotVariable } from "../../debug_runtime";

export interface GodotObject {
  godot_id: bigint;
  type: string;
  sub_values: GodotVariable[];
}

/**
 * A promise that resolves to a {@link GodotObject}.
 *
 * This promise is used to handle the asynchronous nature of requesting a Godot object.
 * It is used as a placeholder until the actual object is received.
 *
 * When the object is received from the server, the promise is resolved with the object.
 * If the object is not received within a certain time, the promise is rejected with an error.
 */
export class GodotObjectPromise {
  private _resolve!: (value: GodotObject | PromiseLike<GodotObject>) => void;
  private _reject!: (reason?: any) => void;
  public promise: Promise<GodotObject>;
  private timeoutId?: NodeJS.Timeout;

  constructor(timeoutMs?: number) {
    this.promise = new Promise<GodotObject>((resolve_arg, reject_arg) => {
      this._resolve = resolve_arg;
      this._reject = reject_arg;

      if (timeoutMs !== undefined) {
        this.timeoutId = setTimeout(() => {
          reject_arg(new Error("GodotObjectPromise timed out"));
        }, timeoutMs);
      }
    });
  }

  async resolve(value: GodotObject) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    await this._resolve(value);
  }

  async reject(reason: Error) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    await this._reject(reason);
  }
}