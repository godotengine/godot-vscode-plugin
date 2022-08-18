extends Node
class_name TestClass2
@icon("res://path/to/icon.png")

# ******************************************************************************

@export var x : int
@export var y : int
@export var z : String
@export_node_path(Resource) var resource_name

@rpc
func remote_function():
	pass

@rpc(any_peer, call_local, unreliable)
func remote_function1():
	pass

# ------------------------------------------------------------------------------

func f():
    await $Button.button_up
    super()
    super.some_function()

	var lambda = func(x):
		pass

    for i in range(1): # `in` is a control keyword
        print(i in range(1)) # `in` is an operator keyword

# ------------------------------------------------------------------------------

signal changed(new_value)
var warns_when_changed = "some value":
	get:
		return warns_when_changed
	set(value):
		changed.emit(value)
		warns_when_changed = value

# ------------------------------------------------------------------------------
