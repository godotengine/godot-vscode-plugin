import {
	GDScriptTypes,
	BufferModel,
	Vector3,
	Vector2,
	Basis,
	AABB,
	Color,
	NodePath,
	ObjectId,
	Plane,
	Quat,
	Rect2,
	Transform,
	Transform2D,
	RawObject,
} from "./variants";

export class VariantDecoder {
	public decode_variant(model: BufferModel) {
		let type = this.decode_UInt32(model);
		switch (type & 0xff) {
			case GDScriptTypes.BOOL:
				return this.decode_UInt32(model) !== 0;
			case GDScriptTypes.INT:
				if (type & (1 << 16)) {
					return this.decode_Int64(model);
				} else {
					return this.decode_Int32(model);
				}
			case GDScriptTypes.REAL:
				if (type & (1 << 16)) {
					return this.decode_Double(model);
				} else {
					return this.decode_Float(model);
				}
			case GDScriptTypes.STRING:
				return this.decode_String(model);
			case GDScriptTypes.VECTOR2:
				return this.decode_Vector2(model);
			case GDScriptTypes.RECT2:
				return this.decode_Rect2(model);
			case GDScriptTypes.VECTOR3:
				return this.decode_Vector3(model);
			case GDScriptTypes.TRANSFORM2D:
				return this.decode_Transform2D(model);
			case GDScriptTypes.PLANE:
				return this.decode_Plane(model);
			case GDScriptTypes.QUAT:
				return this.decode_Quat(model);
			case GDScriptTypes.AABB:
				return this.decode_AABB(model);
			case GDScriptTypes.BASIS:
				return this.decode_Basis(model);
			case GDScriptTypes.TRANSFORM:
				return this.decode_Transform(model);
			case GDScriptTypes.COLOR:
				return this.decode_Color(model);
			case GDScriptTypes.NODE_PATH:
				return this.decode_NodePath(model);
			case GDScriptTypes.OBJECT:
				if (type & (1 << 16)) {
					return this.decode_Object_id(model);
				} else {
					return this.decode_Object(model);
				}
			case GDScriptTypes.DICTIONARY:
				return this.decode_Dictionary(model);
			case GDScriptTypes.ARRAY:
				return this.decode_Array(model);
			case GDScriptTypes.POOL_BYTE_ARRAY:
				return this.decode_PoolByteArray(model);
			case GDScriptTypes.POOL_INT_ARRAY:
				return this.decode_PoolIntArray(model);
			case GDScriptTypes.POOL_REAL_ARRAY:
				return this.decode_PoolFloatArray(model);
			case GDScriptTypes.POOL_STRING_ARRAY:
				return this.decode_PoolStringArray(model);
			case GDScriptTypes.POOL_VECTOR2_ARRAY:
				return this.decode_PoolVector2Array(model);
			case GDScriptTypes.POOL_VECTOR3_ARRAY:
				return this.decode_PoolVector3Array(model);
			case GDScriptTypes.POOL_COLOR_ARRAY:
				return this.decode_PoolColorArray(model);
			default:
				return undefined;
		}
	}

	public get_dataset(buffer: Buffer, offset: number) {
		let len = buffer.readUInt32LE(offset);
		let model: BufferModel = {
			buffer: buffer,
			offset: offset + 4,
			len: len,
		};

		let output = [];
		output.push(len + 4);
		do {
			let value = this.decode_variant(model);
			output.push(value);
		} while (model.len > 0);

		return output;
	}

	private decode_AABB(model: BufferModel) {
		return new AABB(this.decode_Vector3(model), this.decode_Vector3(model));
	}

	private decode_Array(model: BufferModel) {
		let output: Array<any> = [];

		let count = this.decode_UInt32(model);

		for (let i = 0; i < count; i++) {
			let value = this.decode_variant(model);
			output.push(value);
		}

		return output;
	}

	private decode_Basis(model: BufferModel) {
		return new Basis(
			this.decode_Vector3(model),
			this.decode_Vector3(model),
			this.decode_Vector3(model)
		);
	}

	private decode_Color(model: BufferModel) {
		let rgb = this.decode_Vector3(model);
		let a = this.decode_Float(model);

		return new Color(rgb.x, rgb.y, rgb.z, a);
	}

	private decode_Dictionary(model: BufferModel) {
		let output = new Map<any, any>();

		let count = this.decode_UInt32(model);
		for (let i = 0; i < count; i++) {
			let key = this.decode_variant(model);
			let value = this.decode_variant(model);
			output.set(key, value);
		}

		return output;
	}

	private decode_Double(model: BufferModel) {
		let d = model.buffer.readDoubleLE(model.offset);

		model.offset += 8;
		model.len -= 8;

		return d; // + (d < 0 ? -1e-10 : 1e-10);
	}

	private decode_Float(model: BufferModel) {
		let f = model.buffer.readFloatLE(model.offset);

		model.offset += 4;
		model.len -= 4;

		return f; // + (f < 0 ? -1e-10 : 1e-10);
	}

	private decode_Int32(model: BufferModel) {
		let u = model.buffer.readInt32LE(model.offset);

		model.len -= 4;
		model.offset += 4;

		return u;
	}

	private decode_Int64(model: BufferModel) {
		let hi = model.buffer.readInt32LE(model.offset);
		let lo = model.buffer.readInt32LE(model.offset + 4);

		let u: BigInt = BigInt((hi << 32) | lo);

		model.len -= 8;
		model.offset += 8;

		return u;
	}

	private decode_NodePath(model: BufferModel) {
		let name_count = this.decode_UInt32(model) & 0x7fffffff;
		let subname_count = this.decode_UInt32(model);
		let flags = this.decode_UInt32(model);
		let is_absolute = (flags & 1) === 1;
		if (flags & 2) {
			//Obsolete format with property separate from subPath
			subname_count++;
		}

		let total = name_count + subname_count;
		let names: string[] = [];
		let sub_names: string[] = [];
		for (let i = 0; i < total; i++) {
			let str = this.decode_String(model);
			if (i < name_count) {
				names.push(str);
			} else {
				sub_names.push(str);
			}
		}

		return new NodePath(names, sub_names, is_absolute);
	}

	private decode_Object(model: BufferModel) {
		let class_name = this.decode_String(model);
		let prop_count = this.decode_UInt32(model);
		let output = new RawObject(class_name);

		for (let i = 0; i < prop_count; i++) {
			let name = this.decode_String(model);
			let value = this.decode_variant(model);
			output.set(name, value);
		}

		return output;
	}

	private decode_Object_id(model: BufferModel) {
		let id = this.decode_UInt64(model);

		return new ObjectId(id);
	}

	private decode_Plane(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);
		let z = this.decode_Float(model);
		let d = this.decode_Float(model);

		return new Plane(x, y, z, d);
	}

	private decode_PoolByteArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(model.buffer.readUInt8(model.offset));
			model.offset++;
			model.len--;
		}

		return output;
	}

	private decode_PoolColorArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Color[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Color(model));
		}

		return output;
	}

	private decode_PoolFloatArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Float(model));
		}

		return output;
	}

	private decode_PoolIntArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Int32(model));
		}

		return output;
	}

	private decode_PoolStringArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: string[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_String(model));
		}

		return output;
	}

	private decode_PoolVector2Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Vector2[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector2(model));
		}

		return output;
	}

	private decode_PoolVector3Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Vector3[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector3(model));
		}

		return output;
	}

	private decode_Quat(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);
		let z = this.decode_Float(model);
		let w = this.decode_Float(model);

		return new Quat(x, y, z, w);
	}

	private decode_Rect2(model: BufferModel) {
		return new Rect2(this.decode_Vector2(model), this.decode_Vector2(model));
	}

	private decode_String(model: BufferModel) {
		let len = this.decode_UInt32(model);
		let pad = 0;
		if (len % 4 !== 0) {
			pad = 4 - (len % 4);
		}

		let str = model.buffer.toString("utf8", model.offset, model.offset + len);
		len += pad;

		model.offset += len;
		model.len -= len;

		return str;
	}

	private decode_Transform(model: BufferModel) {
		return new Transform(this.decode_Basis(model), this.decode_Vector3(model));
	}

	private decode_Transform2D(model: BufferModel) {
		return new Transform2D(
			this.decode_Vector2(model),
			this.decode_Vector2(model),
			this.decode_Vector2(model)
		);
	}

	private decode_UInt32(model: BufferModel) {
		let u = model.buffer.readUInt32LE(model.offset);
		model.len -= 4;
		model.offset += 4;

		return u;
	}

	private decode_UInt64(model: BufferModel) {
		let hi = model.buffer.readUInt32LE(model.offset);
		let lo = model.buffer.readUInt32LE(model.offset + 4);

		let u = BigInt((hi << 32) | lo);
		model.len -= 8;
		model.offset += 8;

		return u;
	}

	private decode_Vector2(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);

		return new Vector2(x, y);
	}

	private decode_Vector3(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);
		let z = this.decode_Float(model);

		return new Vector3(x, y, z);
	}
}
