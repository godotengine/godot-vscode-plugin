import { GodotVariable } from "../debug_runtime";

export enum GDScriptTypes {
	NIL,

	// atomic types
	BOOL,
	INT,
	REAL,
	STRING,

	// math types

	VECTOR2, // 5
	RECT2,
	VECTOR3,
	TRANSFORM2D,
	PLANE,
	QUAT, // 10
	AABB,
	BASIS,
	TRANSFORM,

	// misc types
	COLOR,
	NODE_PATH, // 15
	_RID,
	OBJECT,
	DICTIONARY,
	ARRAY,

	// arrays
	POOL_BYTE_ARRAY, // 20
	POOL_INT_ARRAY,
	POOL_REAL_ARRAY,
	POOL_STRING_ARRAY,
	POOL_VECTOR2_ARRAY,
	POOL_VECTOR3_ARRAY, // 25
	POOL_COLOR_ARRAY,

	VARIANT_MAX,
}

export interface BufferModel {
	buffer: Buffer;
	len: number;
	offset: number;
}

export interface GDObject {
	stringify_value(): string;
	sub_values(): GodotVariable[];
	type_name(): string;
}

function clean_number(value: number) {
	return +Number.parseFloat(String(value)).toFixed(1);
}

export class Vector3 implements GDObject {
	constructor(
		public x: number = 0.0,
		public y: number = 0.0,
		public z: number = 0.0
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${clean_number(
			this.z
		)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
		];
	}

	public type_name(): string {
		return "Vector3";
	}
}

export class Vector2 implements GDObject {
	constructor(public x: number = 0.0, public y: number = 0.0) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
		];
	}

	public type_name(): string {
		return "Vector2";
	}
}

export class Basis implements GDObject {
	constructor(public x: Vector3, public y: Vector3, public z: Vector3) {}

	public stringify_value(): string {
		return `(${this.x.stringify_value()}, ${this.y.stringify_value()}, ${this.z.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
		];
	}

	public type_name(): string {
		return "Basis";
	}
}

export class AABB implements GDObject {
	constructor(public position: Vector3, public size: Vector3) {}

	public stringify_value(): string {
		return `(${this.position.stringify_value()}, ${this.size.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "position", value: this.position },
			{ name: "size", value: this.size },
		];
	}

	public type_name(): string {
		return "AABB";
	}
}

export class Color implements GDObject {
	constructor(
		public r: number,
		public g: number,
		public b: number,
		public a: number = 1.0
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.r)}, ${clean_number(this.g)}, ${clean_number(
			this.b
		)}, ${clean_number(this.a)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "r", value: this.r },
			{ name: "g", value: this.g },
			{ name: "b", value: this.b },
			{ name: "a", value: this.a },
		];
	}

	public type_name(): string {
		return "Color";
	}
}

export class NodePath implements GDObject {
	constructor(
		public names: string[],
		public sub_names: string[],
		public absolute: boolean
	) {}

	public stringify_value(): string {
		return `(/${this.names.join("/")}${
			this.sub_names.length > 0 ? ":" : ""
		}${this.sub_names.join(":")})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "names", value: this.names },
			{ name: "sub_names", value: this.sub_names },
			{ name: "absolute", value: this.absolute },
		];
	}

	public type_name(): string {
		return "NodePath";
	}
}

export class RawObject extends Map<any, any> {
	constructor(public class_name: string) {
		super();
	}
}

export class ObjectId implements GDObject {
	constructor(public id: bigint) {}

	public stringify_value(): string {
		return `<${this.id}>`;
	}

	public sub_values(): GodotVariable[] {
		return [{ name: "id", value: this.id }];
	}

	public type_name(): string {
		return "Object";
	}
}

export class Plane implements GDObject {
	constructor(
		public x: number,
		public y: number,
		public z: number,
		public d: number
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${clean_number(
			this.z
		)}, ${clean_number(this.d)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
			{ name: "d", value: this.d },
		];
	}

	public type_name(): string {
		return "Plane";
	}
}

export class Quat implements GDObject {
	constructor(
		public x: number,
		public y: number,
		public z: number,
		public w: number
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${clean_number(
			this.z
		)}, ${clean_number(this.w)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
			{ name: "w", value: this.w },
		];
	}

	public type_name(): string {
		return "Quat";
	}
}

export class Rect2 implements GDObject {
	constructor(public position: Vector2, public size: Vector2) {}

	public stringify_value(): string {
		return `(${this.position.stringify_value()} - ${this.size.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "position", value: this.position },
			{ name: "size", value: this.size },
		];
	}

	public type_name(): string {
		return "Rect2";
	}
}

export class Transform implements GDObject {
	constructor(public basis: Basis, public origin: Vector3) {}

	public stringify_value(): string {
		return `(${this.basis.stringify_value()} - ${this.origin.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "basis", value: this.basis },
			{ name: "origin", value: this.origin },
		];
	}

	public type_name(): string {
		return "Transform";
	}
}

export class Transform2D implements GDObject {
	constructor(public origin: Vector2, public x: Vector2, public y: Vector2) {}

	public stringify_value(): string {
		return `(${this.origin.stringify_value()} - (${this.x.stringify_value()}, ${this.y.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "origin", value: this.origin },
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
		];
	}

	public type_name(): string {
		return "Transform2D";
	}
}
