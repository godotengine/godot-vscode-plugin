enum GDScriptTypes {
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

	VARIANT_MAX
}

interface BufferModel {
	buffer: Buffer;
	len: number;
	offset: number;
}

export class VariantParser {
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

	public encode_variant(
		value:
			| number
			| bigint
			| boolean
			| string
			| Map<any, any>
			| Array<any>
			| object
			| undefined,
		model?: BufferModel
	) {
		if(typeof value === "number" && (value > 2147483647 || value < -2147483648)) {
			value = BigInt(value);
		}
		
		if (!model) {
			let size = this.size_variant(value);
			let buffer = Buffer.alloc(size + 4);
			model = {
				buffer: buffer,
				offset: 0,
				len: 0
			};
			this.encode_UInt32(size, model);
		}
		
		switch (typeof value) {
			case "number":
				{
					let is_integer = Number.isInteger(value);
					if (is_integer) {
						this.encode_UInt32(GDScriptTypes.INT, model);
						this.encode_UInt32(value, model);
					} else {
						this.encode_UInt32(GDScriptTypes.REAL | (1 << 16), model);
						this.encode_Float(value, model);
					}
				}
				break;
			case "bigint":
				this.encode_UInt32(GDScriptTypes.INT | (1 << 16), model);
				this.encode_UInt64(value, model);
				break;
			case "boolean":
				this.encode_UInt32(GDScriptTypes.BOOL, model);
				this.encode_Bool(value, model);
				break;
			case "string":
				this.encode_UInt32(GDScriptTypes.STRING, model);
				this.encode_String(value, model);
				break;
			case "undefined":
				break;
			default:
				if (Array.isArray(value)) {
					this.encode_UInt32(GDScriptTypes.ARRAY, model);
					this.encode_Array(value, model);
				} else if (value instanceof Map) {
					this.encode_UInt32(GDScriptTypes.DICTIONARY, model);
					this.encode_Dictionary(value, model);
				} else {
					switch (value["__type__"]) {
						case "Vector2":
							this.encode_UInt32(GDScriptTypes.VECTOR2, model);
							this.encode_Vector2(value, model);
							break;
						case "Rect2":
							this.encode_UInt32(GDScriptTypes.RECT2, model);
							this.encode_Rect2(value, model);
							break;
						case "Vector3":
							this.encode_UInt32(GDScriptTypes.VECTOR3, model);
							this.encode_Vector3(value, model);
							break;
						case "Transform2D":
							this.encode_UInt32(GDScriptTypes.TRANSFORM2D, model);
							this.encode_Transform2D(value, model);
							break;
						case "Plane":
							this.encode_UInt32(GDScriptTypes.PLANE, model);
							this.encode_Plane(value, model);
							break;
						case "Quat":
							this.encode_UInt32(GDScriptTypes.QUAT, model);
							this.encode_Quat(value, model);
							break;
						case "AABB":
							this.encode_UInt32(GDScriptTypes.AABB, model);
							this.encode_AABB(value, model);
							break;
						case "Basis":
							this.encode_UInt32(GDScriptTypes.BASIS, model);
							this.encode_Basis(value, model);
							break;
						case "Transform":
							this.encode_UInt32(GDScriptTypes.TRANSFORM, model);
							this.encode_Transform(value, model);
							break;
						case "Color":
							this.encode_UInt32(GDScriptTypes.COLOR, model);
							this.encode_Color(value, model);
							break;
					}
				}
		}

		return model.buffer;
	}

	public get_buffer_dataset(buffer: Buffer, offset: number) {
		let len = buffer.readUInt32LE(offset);
		let model: BufferModel = {
			buffer: buffer,
			offset: offset + 4,
			len: len
		};

		let output = [];
		output.push(len + 4);
		do {
			let value = this.decode_variant(model);
			output.push(value);
		} while (model.len > 0);

		return output;
	}

	private clean(value: number) {
		return +Number.parseFloat(String(value)).toFixed(1);
	}

	private decode_AABB(model: BufferModel) {
		let px = this.decode_Float(model);
		let py = this.decode_Float(model);
		let pz = this.decode_Float(model);
		let sx = this.decode_Float(model);
		let sy = this.decode_Float(model);
		let sz = this.decode_Float(model);

		return {
			__type__: "AABB",
			position: this.make_Vector3(px, py, pz),
			size: this.make_Vector3(sx, sy, sz),
			__render__: () =>
				`AABB (${this.clean(px)}, ${this.clean(py)}, ${this.clean(
					pz
				)} - ${this.clean(sx)}, ${this.clean(sy)}, ${this.clean(sz)})`
		};
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
		let x = this.decode_Vector3(model);
		let y = this.decode_Vector3(model);
		let z = this.decode_Vector3(model);

		return this.make_Basis(
			[x.x, x.y, z.z as number],
			[y.x, y.y, y.z as number],
			[z.x, z.y, z.z as number]
		);
	}

	private decode_Color(model: BufferModel) {
		let r = this.decode_Float(model);
		let g = this.decode_Float(model);
		let b = this.decode_Float(model);
		let a = this.decode_Float(model);

		return {
			__type__: "Color",
			r: r,
			g: g,
			b: b,
			a: a,
			__render__: () =>
				`Color (${this.clean(r)}, ${this.clean(g)}, ${this.clean(
					b
				)}, ${this.clean(a)})`
		};
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
		let view = new DataView(model.buffer.buffer, model.offset, 8);
		let d = view.getFloat64(0, true);

		model.offset += 8;
		model.len -= 8;

		return d + 0.00000000001;
	}

	private decode_Float(model: BufferModel) {
		let view = new DataView(model.buffer.buffer, model.offset, 4);
		let f = view.getFloat32(0, true);

		model.offset += 4;
		model.len -= 4;

		return f + 0.00000000001;
	}

	private decode_Int32(model: BufferModel) {
		let u = model.buffer.readInt32LE(model.offset);
		model.len -= 4;
		model.offset += 4;

		return u;
	}

	private decode_Int64(model: BufferModel) {
		let view = new DataView(model.buffer.buffer, model.offset, 8);
		let u = view.getBigInt64(0, true);
		model.len -= 8;
		model.offset += 8;

		return Number(u);
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

		return {
			__type__: "NodePath",
			path: names,
			subpath: sub_names,
			absolute: is_absolute,
			__render__: () => `NodePath (${names.join(".")}:${sub_names.join(":")})`
		};
	}

	private decode_Object(model: BufferModel) {
		let class_name = this.decode_String(model);
		let prop_count = this.decode_UInt32(model);
		let props: { name: string; value: any }[] = [];
		for (let i = 0; i < prop_count; i++) {
			let name = this.decode_String(model);
			let value = this.decode_variant(model);
			props.push({ name: name, value: value });
		}

		return { __type__: class_name, properties: props };
	}

	private decode_Object_id(model: BufferModel) {
		let id = this.decode_UInt64(model);
		return {
			__type__: "Object",
			id: id,
			__render__: () => `Object<${id}>`
		};
	}

	private decode_Plane(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);
		let z = this.decode_Float(model);
		let d = this.decode_Float(model);

		return {
			__type__: "Plane",
			x: x,
			y: y,
			z: z,
			d: d,
			__render__: () =>
				`Plane (${this.clean(x)}, ${this.clean(y)}, ${this.clean(
					z
				)}, ${this.clean(d)})`
		};
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
		let output: { r: number; g: number; b: number; a: number }[] = [];
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
		let output: { x: number; y: number }[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector2(model));
		}

		return output;
	}

	private decode_PoolVector3Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: { x: number; y: number; z: number | undefined }[] = [];
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

		return {
			__type__: "Quat",
			x: x,
			y: y,
			z: z,
			w: w,
			__render__: () =>
				`Quat (${this.clean(x)}, ${this.clean(y)}, ${this.clean(
					z
				)}, ${this.clean(w)})`
		};
	}

	private decode_Rect2(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);
		let sizeX = this.decode_Float(model);
		let sizeY = this.decode_Float(model);

		return {
			__type__: "Rect2",
			position: this.make_Vector2(x, y),
			size: this.make_Vector2(sizeX, sizeY),
			__render__: () =>
				`Rect2 (${this.clean(x)}, ${this.clean(y)} - ${this.clean(
					sizeX
				)}, ${this.clean(sizeY)})`
		};
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
		let b = this.decode_Basis(model);
		let o = this.decode_Vector3(model);

		return {
			__type__: "Transform",
			basis: this.make_Basis(
				[b.x.x, b.x.y, b.x.z as number],
				[b.y.x, b.y.y, b.y.z as number],
				[b.z.x, b.z.y, b.z.z as number]
			),
			origin: this.make_Vector3(o.x, o.y, o.z),
			__render__: () =>
				`Transform ((${this.clean(b.x.x)}, ${this.clean(b.x.y)}, ${this.clean(
					b.x.z as number
				)}), (${this.clean(b.y.x)}, ${this.clean(b.y.y)}, ${this.clean(
					b.y.z as number
				)}), (${this.clean(b.z.x)}, ${this.clean(b.z.y)}, ${this.clean(
					b.z.z as number
				)}) - (${this.clean(o.x)}, ${this.clean(o.y)}, ${this.clean(
					o.z as number
				)}))`
		};
	}

	private decode_Transform2D(model: BufferModel) {
		let origin = this.decode_Vector2(model);
		let x = this.decode_Vector2(model);
		let y = this.decode_Vector2(model);

		return {
			__type__: "Transform2D",
			origin: this.make_Vector2(origin.x, origin.y),
			x: this.make_Vector2(x.x, x.y),
			y: this.make_Vector2(y.x, y.y),
			__render__: () =>
				`Transform2D ((${this.clean(origin.x)}, ${this.clean(
					origin.y
				)}) - (${this.clean(x.x)}, ${this.clean(x.y)}), (${this.clean(
					y.x
				)}, ${this.clean(y.x)}))`
		};
	}

	private decode_UInt32(model: BufferModel) {
		let u = model.buffer.readUInt32LE(model.offset);
		model.len -= 4;
		model.offset += 4;

		return u;
	}

	private decode_UInt64(model: BufferModel) {
		let view = new DataView(model.buffer.buffer, model.offset, 8);
		let u = view.getBigUint64(0, true);
		model.len -= 8;
		model.offset += 8;

		return Number(u);
	}

	private decode_Vector2(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);

		return this.make_Vector2(x, y);
	}

	private decode_Vector3(model: BufferModel) {
		let x = this.decode_Float(model);
		let y = this.decode_Float(model);
		let z = this.decode_Float(model);

		return this.make_Vector3(x, y, z);
	}

	private encode_AABB(value: object, model: BufferModel) {
		this.encode_Vector3(value["position"], model);
		this.encode_Vector3(value["size"], model);
	}

	private encode_Array(arr: any[], model: BufferModel) {
		let size = arr.length;
		this.encode_UInt32(size, model);
		arr.forEach(e => {
			this.encode_variant(e, model);
		});
	}

	private encode_Basis(value: object, model: BufferModel) {
		this.encode_Vector3(value["x"], model);
		this.encode_Vector3(value["y"], model);
		this.encode_Vector3(value["z"], model);
	}

	private encode_Bool(bool: boolean, model: BufferModel) {
		this.encode_UInt32(bool ? 1 : 0, model);
	}

	private encode_Color(value: object, model: BufferModel) {
		this.encode_Float(value["r"], model);
		this.encode_Float(value["g"], model);
		this.encode_Float(value["b"], model);
		this.encode_Float(value["a"], model);
	}

	private encode_Dictionary(dict: Map<any, any>, model: BufferModel) {
		let size = dict.size;
		this.encode_UInt32(size, model);
		let keys = Array.from(dict.keys());
		keys.forEach(key => {
			let value = dict.get(key);
			this.encode_variant(key, model);
			this.encode_variant(value, model);
		});
	}
	
	private encode_Float(value: number, model: BufferModel) {
		let view = new DataView(model.buffer.buffer, model.offset);
		view.setFloat32(0, value, true);
		model.offset += 4;
	}

	private encode_Double(value: number, model: BufferModel) {
		let view = new DataView(model.buffer.buffer, model.offset);
		view.setFloat64(0, value, true);
		model.offset += 8;
	}

	private encode_Plane(value: object, model: BufferModel) {
		this.encode_Vector3(value["normal"], model);
		this.encode_Float(value["d"], model);
	}

	private encode_Quat(value: object, model: BufferModel) {
		this.encode_Float(value["x"], model);
		this.encode_Float(value["y"], model);
		this.encode_Float(value["z"], model);
		this.encode_Float(value["w"], model);
	}

	private encode_Rect2(value: object, model: BufferModel) {
		this.encode_Vector2(value["position"], model);
		this.encode_Vector2(value["size"], model);
	}

	private encode_String(str: string, model: BufferModel) {
		let str_len = str.length;
		this.encode_UInt32(str_len, model);
		model.buffer.write(str, model.offset, str_len, "utf8");
		model.offset += str_len;
		str_len += 4;
		while (str_len % 4) {
			str_len++;
			model.buffer.writeUInt8(0, model.offset);
			model.offset++;
		}
	}

	private encode_Transform(value: object, model: BufferModel) {
		this.encode_Basis(value["basis"], model);
		this.encode_Vector3(value["origin"], model);
	}

	private encode_Transform2D(value: object, model: BufferModel) {
		this.encode_Vector2(value["origin"], model);
		this.encode_Vector2(value["x"], model);
		this.encode_Vector2(value["y"], model);
	}

	private encode_UInt32(int: number, model: BufferModel) {
		model.buffer.writeUInt32LE(int, model.offset);
		model.offset += 4;
	}

	private encode_UInt64(value: bigint, model: BufferModel) {
		let view = new DataView(model.buffer.buffer, model.offset, 8);
		view.setBigUint64(0, value, true);
		model.offset += 8;
	}

	private encode_Vector2(value: any, model: BufferModel) {
		this.encode_Float(value.x, model);
		this.encode_Float(value.y, model);
	}

	private encode_Vector3(value: any, model: BufferModel) {
		this.encode_Float(value.x, model);
		this.encode_Float(value.y, model);
		this.encode_Float(value.z, model);
	}

	private make_Basis(x: number[], y: number[], z: number[]) {
		return {
			__type__: "Basis",
			x: this.make_Vector3(x[0], x[1], x[2]),
			y: this.make_Vector3(y[0], y[1], y[2]),
			z: this.make_Vector3(z[0], z[1], z[2]),
			__render__: () =>
				`Basis ((${this.clean(x[0])}, ${this.clean(x[1])}, ${this.clean(
					x[2]
				)}), (${this.clean(y[0])}, ${this.clean(y[1])}, ${this.clean(
					y[2]
				)}), (${this.clean(z[0])}, ${this.clean(z[1])}, ${this.clean(z[2])}))`
		};
	}

	private make_Vector2(x: number, y: number) {
		return {
			__type__: `Vector2`,
			x: x,
			y: y,
			__render__: () => `Vector2 (${this.clean(x)}, ${this.clean(y)})`
		};
	}

	private make_Vector3(x: number, y: number, z: number) {
		return {
			__type__: `Vector3`,
			x: x,
			y: y,
			z: z,
			__render__: () =>
				`Vector3 (${this.clean(x)}, ${this.clean(y)}, ${this.clean(z)})`
		};
	}

	private size_Bool(): number {
		return this.size_UInt32();
	}

	private size_Dictionary(dict: Map<any, any>): number {
		let size = this.size_UInt32();
		let keys = Array.from(dict.keys());
		keys.forEach(key => {
			let value = dict.get(key);
			size += this.size_variant(key);
			size += this.size_variant(value);
		});

		return size;
	}

	private size_String(str: string): number {
		let size = this.size_UInt32() + str.length;
		while (size % 4) {
			size++;
		}
		return size;
	}

	private size_UInt32(): number {
		return 4;
	}

	private size_UInt64(): number {
		return 8;
	}

	private size_array(arr: any[]): number {
		let size = this.size_UInt32();
		arr.forEach(e => {
			size += this.size_variant(e);
		});

		return size;
	}

	private size_variant(
		value:
			| number
			| bigint
			| boolean
			| string
			| Map<any, any>
			| any[]
			| object
			| undefined
	): number {
		let size = 4;
		
		if(typeof value === "number" && (value > 2147483647 || value < -2147483648)) {
			value = BigInt(value);
		}

		switch (typeof value) {
			case "number":
				size += this.size_UInt32();
				break;
			case "bigint":
				size += this.size_UInt64();
				break;
			case "boolean":
				size += this.size_Bool();
				break;
			case "string":
				size += this.size_String(value);
				break;
			case "undefined":
				break;
			default:
				if (Array.isArray(value)) {
					size += this.size_array(value);
					break;
				} else if (value instanceof Map) {
					size += this.size_Dictionary(value);
					break;
				} else {
					switch (value["__type__"]) {
						case "Vector2":
							size += this.size_UInt32() * 2;
							break;
						case "Rect2":
							size += this.size_UInt32() * 4;
							break;
						case "Vector3":
							size += this.size_UInt32() * 3;
							break;
						case "Transform2D":
							size += this.size_UInt32() * 6;
							break;
						case "Plane":
							size += this.size_UInt32() * 4;
							break;
						case "Quat":
							size += this.size_UInt32() * 4;
							break;
						case "AABB":
							size += this.size_UInt32() * 6;
							break;
						case "Basis":
							size += this.size_UInt32() * 9;
							break;
						case "Transform":
							size += this.size_UInt32() * 12;
							break;
						case "Color":
							size += this.size_UInt32() * 4;
							break;
					}
				}
		}

		return size;
	}
}
