# --- IN ---
func dump() -> String:
	return """
	{
		level_file: '%s',
		md5_hash: %s,
		text: '%s',
		level_size: %s,
		world_pos: %s,
		preview_size: %s,
		preview_pos: %s,
		preview_texture: %s,
		explorer_layer: %s,
		connections: %s,
		test {test},
	}
	"""
