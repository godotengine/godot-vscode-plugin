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
# signal sig_d(param1: int, param2: Dictionary)
# signal sig_e(
# 		param1: int, # first param
# 		param2: Dictionary,
# 	)

# ------------------------------------------------------------------------------

var f = 40 setget set_f
func set_f(value):
	pass

var g:int setget set_g, get_g
func set_g(value: int=0) -> void:
	pass

var h:float = 1.0 setget set_h, get_h
func set_h(value: int=0) -> void:
	pass

func get_g() -> int:
	return 0

# ------------------------------------------------------------------------------

func func_a(param1, param2, param3):
	self.test()
	$Node.get_node('Foo')
	$Node.has_node('Foo')
	$Node.find_node('Foo')
	$Node.get_node_or_null('Foo')
	print($Node.has_node('Foo'))
	print(NodePath('Foo'))
	print(NodePath("Foo"))
	pass

func func_b(param1, param2=func_a(10, 1.0, 'test')) -> void:
	pass

func func_b1(param1 = false, param2: bool = false, param3 := false):
	pass

func func_b2(param1 = 10, param2: int = 100, param3 := 1000):
	pass

func func_b3(param1 = 1.0, param2: float = 10.0, param3 := 100.001):
	pass

func func_b4(param1 = 'foo', param2: String = 'bar', param3 := 'foobar'):
	pass

func func_b5(
		param1 = 'foo', # comment
		param2: String = 'bar',
		param3: float = 3.14159,
		param4:='foobar',
		param5:=1000,
		param6:=[],
		param7:={},
		param8:=func_a(),
		param9:=Vector2(0, 1),
		param10:=Vector2(0, 0),
		param11:=Color(1, 1, 1, 0.5),
		param12:=NodePath('Foo')
	) -> void:
	pass

var dict = {
	a = 0,
	b = 0.0,
	c = 'test',
} 

func func_c(
		param1: int = 10,
		param2 := 1.0,
		param3: String = 'string',
		param4 := {a=0, b=0.0, c='test'}
	):
	pass

# ------------------------------------------------------------------------------

var q = "double quotes"
var r = 'single quotes'
var s = """
triple double quotes
"""
var t = '''triple single quotes''' # this should be red because it's invalid

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

func if_test():
	var some_bool := true

	while some_bool:
		pass
	while (some_bool):
		pass

	if some_bool:
		return some_bool

	if (some_bool):
		return (some_bool)
	elif !some_bool:
		return !some_bool
	elif !(some_bool):
		return !(some_bool)
	elif (some_bool):
		pass
	else:
		pass

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
