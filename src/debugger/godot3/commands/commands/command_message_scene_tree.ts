import { Command } from "../command";
import { Mediator } from "../../mediator";
import { SceneNode } from "../../scene_tree/scene_tree_provider";

export class CommandMessageSceneTree extends Command {
	public trigger(parameters: any[]) {
		let scene = this.parse_next(parameters, { offset: 0 });

		Mediator.notify("scene_tree", [scene]);
	}

	private parse_next(params: any[], ofs: { offset: number }): SceneNode {
		let child_count: number = params[ofs.offset++];
		let name: string = params[ofs.offset++];
		let class_name: string = params[ofs.offset++];
		let id: number = params[ofs.offset++];

		let children: SceneNode[] = [];
		for (let i = 0; i < child_count; ++i) {
			children.push(this.parse_next(params, ofs));
		}

		return new SceneNode(name, class_name, id, children);
	}
}
