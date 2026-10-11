extends SceneTree

func _init():
	call_deferred("_exercise")

func _exercise():
	var huge_array = []
	var huge_dictionary = {}
	for index in range(10000):
		huge_array.append(index)
	for index in range(500):
		huge_dictionary["key_%s" % index] = index
	for cycle in range(110):
		var local_cycle = cycle
		breakpoint
		local_cycle += huge_array[0] + huge_dictionary["key_0"]
	quit()
