extends SceneTree

var trace = []

func first():
	trace.append("first")
	return 1

func second():
	trace.append("second")
	return 2

func combine(a, b):
	trace.append("combine")
	return a + b

func _init():
	call_deferred("_exercise")

func _exercise():
	breakpoint
	var result = combine(first(), second())
	print(result)
	quit()
