# --- IN ---
func test():

	pass
# --- OUT ---
func test():
	pass

# --- IN ---
class Test:

	func _ready():

		pass
# --- OUT ---
class Test:
	func _ready():
		pass

# --- CONFIG ---
{"maxEmptyLines": 1}
# --- IN ---
func a():
	pass



func b():
	pass
# --- OUT ---
func a():
	pass

func b():
	pass

# --- CONFIG ---
{"maxEmptyLines": 2}
# --- IN ---
func a():
	pass



func b():
	pass
# --- OUT ---
func a():
	pass


func b():
	pass
