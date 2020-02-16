export class Command {
	private callback?: (
		parameters: Array<boolean | number | string | {} | [] | undefined>
	) => void | undefined;
	private param_count = -1;
	private param_count_callback?: (paramCount: number) => number;
	private parameters: Array<
		boolean | number | string | {} | [] | undefined
	> = [];

	public name: string;

	constructor(
		name: string,
		parameters_fulfilled?: (parameters: Array<any>) => void | undefined,
		modify_param_count?: (param_count: number) => number
	) {
		this.name = name;
		this.callback = parameters_fulfilled;
		this.param_count_callback = modify_param_count;
	}

	public append_parameters(
		parameter: boolean | number | string | {} | [] | undefined
	) {
		if (this.param_count <= 0) {
			this.param_count = parameter as number;
			if (this.param_count === 0) {
				if (this.callback) {
					this.callback([]);
				}
			}
			return;
		}

		this.parameters.push(parameter);

		if (this.parameters.length === this.get_param_count()) {
			if (this.callback) {
				this.callback(this.parameters);
			}
		}
	}

	public chain() {
		if (this.parameters.length === this.get_param_count()) {
			this.parameters.length = 0;
			this.param_count = -1;
			return undefined;
		} else {
			return this;
		}
	}

	protected get_param_count() {
		return this.param_count_callback
			? this.param_count_callback(this.param_count)
			: this.param_count;
	}
}
