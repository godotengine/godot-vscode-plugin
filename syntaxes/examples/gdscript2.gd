extends Node
class_name TestClass2

# ******************************************************************************

@export var x : int
@export(int) var y : int
@export(String) var z : String
@export_node_path(Resource) var resource_name

@rpc
func remote_function():
	pass

# ------------------------------------------------------------------------------

func f():
    await $Button.button_up
    super()
    super.some_function()
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
