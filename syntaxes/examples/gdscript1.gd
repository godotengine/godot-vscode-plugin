extends Node
class_name TestClass

# ******************************************************************************

var a
remote var b = 10.0
remotesync var c := 20
master var d :int = 30
puppet var e :int

signal sig_a
signal sig_b()
signal sig_c(param1, param2)
signal sig_d(param1: int, param2: Dictionary)
signal sig_e(
		param1: int, # first param
		param2: Dictionary,
	)

# ------------------------------------------------------------------------------

var f = 40 setget set_f
func set_f(value):
	pass

var g:int setget set_g, get_g
func set_g(value: int=0) -> void:
	pass

func get_g() -> int:
	return 0

# ------------------------------------------------------------------------------

func func_a():
	pass

func func_b(param1, param2):
	pass

var dict = {
	a = 0,
	b = 0.0,
	c = 'test',
} 

func func_c(
		param1: int = 10,
		param11,
		param2 := 1.0,
		param3: String = 'string',
		param4 := {a=0, b=0.0, c='test'},
	):
	pass

# ------------------------------------------------------------------------------

var h = "double quotes"
var i = 'single quotes'
var j = """
triple double quotes
"""
# var k = '''triple single quotes''' # this should be red because it's invalid

# ------------------------------------------------------------------------------

var IS_CONSTANT
var not_CONSTANT
var ALSO_NOT_constant
var CONSTANT_not

# ------------------------------------------------------------------------------

onready var node_a = $Child
onready var node_b = $Child/GrandChild
onready var node_bb = $Child/GrandChild/GreatGrandChild
onready var node_bbb = $Child/GrandChild/GreatGrandChild/GreatGreatGrandChild
onready var node_c = $"../Sibling"
onready var node_cc = $'../Sibling'
onready var node_d = $'..' # parent
onready var node_e = $"../.." # grandparent

onready var node_f = get_node('Child')
onready var node_g = get_node("Child/GrandChild")
onready var node_h = get_node("../Sibling")

if has_node('Child') and get_node('Child').has_node('GrandChild'):
	pass

onready var node_i = $badlyNamedChild
onready var node_j = $badlyNamedChild/badly_named_grandchild

var node_path_a = NodePath("Child")
var node_path_b = NodePath('Child/GrandChild')
var node_path_c = NodePath('../Sibling')

# ------------------------------------------------------------------------------

var _script = GDScript.new()

var directions = [
	Vector2.UP,
	Vector2.DOWN,
	Vector2.LEFT,
	Vector2.RIGHT,
]

enum test_enum {
	VALUE_1,
	VALUE_2,
	VALUE_3,
}

export(test_enum) var enum_variable = test_enum.VALUE_1

# ------------------------------------------------------------------------------

class InnerClass:
	var some_var = 100
	var dict = {
		'key_a': some_var,
		'key_b': str(10),
		key_c = some_var,
		key_d = int('10'),
		key_e = Color(1, 1, 1),
		key_f = Vector2(10, -10)
	}

	func _ready():
		if true and true:
			pass
		elif false:
			while true:
				pass
		else:
			pass
		
		pass
	

