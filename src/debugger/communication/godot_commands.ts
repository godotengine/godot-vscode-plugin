import { CommandBuilder } from "./command_builder";
import { VariantParser } from "../variant_parser";
import net = require("net");

export class GodotCommands {
	private builder: CommandBuilder;
	private can_write = false;
	private command_buffer: Buffer[] = [];
	private connection: net.Socket | undefined;
	private parser: VariantParser;

	constructor(
		builder: CommandBuilder,
		parser: VariantParser,
		connection?: net.Socket
	) {
		this.builder = builder;
		this.parser = parser;
		this.connection = connection;
	}

	public send_break_command() {
		let buffer = this.builder.create_buffered_command("break", this.parser);
		this.add_and_send(buffer);
	}

	public send_continue_Command() {
		let buffer = this.builder.create_buffered_command("continue", this.parser);
		this.add_and_send(buffer);
	}

	public send_inspect_object_command(object_id: number) {
		let buffer = this.builder.create_buffered_command(
			"inspect_object",
			this.parser,
			[object_id]
		);

		this.add_and_send(buffer);
	}

	public set_object_property(
		object_id: number,
		label: string,
		new_parsed_value: any
	) {
		let buffer = this.builder.create_buffered_command(
			"set_object_property",
			this.parser,
			[BigInt(object_id), label, new_parsed_value]
		);
		this.add_and_send(buffer);
	}

	public send_next_command() {
		let buffer = this.builder.create_buffered_command("next", this.parser);
		this.add_and_send(buffer);
	}

	public send_remove_breakpoint_command(file: string, line: number) {
		this.send_breakpoint_command(false, file, line);
	}

	public send_request_scene_tree_command() {
		let buffer = this.builder.create_buffered_command(
			"request_scene_tree",
			this.parser
		);
		this.add_and_send(buffer);
	}

	public send_set_breakpoint_command(file: string, line: number) {
		this.send_breakpoint_command(true, file, line);
	}

	public send_skip_breakpoints_command(skip_breakpoints: boolean) {
		let buffer = this.builder.create_buffered_command(
			"set_skip_breakpoints",
			this.parser,
			[skip_breakpoints]
		);

		this.add_and_send(buffer);
	}

	public send_stack_dump_command() {
		let buffer = this.builder.create_buffered_command(
			"get_stack_dump",
			this.parser
		);

		this.add_and_send(buffer);
	}

	public send_stack_frame_vars_command(level: number) {
		let buffer = this.builder.create_buffered_command(
			"get_stack_frame_vars",
			this.parser,
			[level]
		);

		this.add_and_send(buffer);
	}

	public send_step_command() {
		let buffer = this.builder.create_buffered_command("step", this.parser);
		this.add_and_send(buffer);
	}

	public set_can_write(value: boolean) {
		this.can_write = value;
		if (this.can_write) {
			this.send_buffer();
		}
	}

	public set_connection(connection: net.Socket) {
		this.connection = connection;
		this.can_write = true;
	}

	private add_and_send(buffer: Buffer) {
		this.command_buffer.push(buffer);
		this.send_buffer();
	}

	private send_breakpoint_command(set: boolean, file: string, line: number) {
		let buffer = this.builder.create_buffered_command(
			"breakpoint",
			this.parser,
			[file, line, set]
		);
		this.add_and_send(buffer);
	}

	private send_buffer() {
		if (!this.connection) {
			return;
		}

		while (this.can_write && this.command_buffer.length > 0) {
			this.can_write = this.connection.write(
				this.command_buffer.shift() as Buffer
			);
		}
	}
}
