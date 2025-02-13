import { expect } from "chai";
import { GodotIdWithPath, GodotIdToVscodeIdMapper } from "./godot_id_to_vscode_id_mapper";

suite("GodotIdToVscodeIdMapper", () => {
  test("create_vscode_id assigns unique ID", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(1), ["path1"]);
    const vscodeId = mapper.create_vscode_id(godotId);
    expect(vscodeId).to.equal(1);
  });

  test("create_vscode_id throws error on duplicate", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(1), ["path1"]);
    mapper.create_vscode_id(godotId);
    expect(() => mapper.create_vscode_id(godotId)).to.throw("Duplicate godot_id: 1:path1");
  });

  test("get_godot_id_with_path returns correct object", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(2), ["path2"]);
    const vscodeId = mapper.create_vscode_id(godotId);
    expect(mapper.get_godot_id_with_path(vscodeId)).to.deep.equal(godotId);
  });

  test("get_godot_id_with_path throws error if not found", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    expect(() => mapper.get_godot_id_with_path(999)).to.throw("Unknown vscode_id: 999");
  });

  test("get_vscode_id retrieves correct ID", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(3), ["path3"]);
    const vscodeId = mapper.create_vscode_id(godotId);
    expect(mapper.get_vscode_id(godotId)).to.equal(vscodeId);
  });

  test("get_vscode_id throws error if not found", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(4), ["path4"]);
    expect(() => mapper.get_vscode_id(godotId)).to.throw("Unknown godot_id_with_path: 4:path4");
  });

  test("get_or_create_vscode_id creates new ID if not found", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(5), ["path5"]);
    const vscodeId = mapper.get_or_create_vscode_id(godotId);
    expect(vscodeId).to.equal(1);
  });

  test("get_or_create_vscode_id retrieves existing ID if already created", () => {
    const mapper = new GodotIdToVscodeIdMapper();
    const godotId = new GodotIdWithPath(BigInt(6), ["path6"]);
    const vscodeId1 = mapper.get_or_create_vscode_id(godotId);
    const vscodeId2 = mapper.get_or_create_vscode_id(godotId);
    expect(vscodeId1).to.equal(vscodeId2);
  });
});
