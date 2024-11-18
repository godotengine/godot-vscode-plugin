# --- IN ---
var test1 := deg_to_rad(
	-90
)

# --- IN ---
var test2 := Vector2(
	-0.0,
	1.0
)

# --- IN ---
var test3 := Vector3(
	0.0,
	-0.0,
	0.0
)

# --- IN ---
func get_audio_compensation() -> float:
	return AudioServer.get_time_since_last_mix() \
		- AudioServer.get_output_latency() \
		+ (1 / Engine.get_frames_per_second()) * 2