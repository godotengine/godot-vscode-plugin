extends Node
class_name TestClass2

# ******************************************************************************

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
