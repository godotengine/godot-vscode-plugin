extends SceneTree

func _initialize() -> void:
	var huge_array: Array[int] = []
	for index in range(1000):
		huge_array.append(index)
	breakpoint
	for index in range(100):
		var current: int = huge_array[index]
		if current < 0:
			print("unreachable")
	quit()
