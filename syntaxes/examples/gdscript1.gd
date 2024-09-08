extends Node
class_name TestClass

# ******************************************************************************

var var_a = 0
var var_b = true
var var_c := true
var var_d : bool = true
var var_e :    bool = true
var var_f:bool=true
var var_g : string = 'foo'
var var_h : string = "foo"

var integer = 12_345_678  # Equal to 12345678.
var floating = 3.141_592_7  # Equal to 3.1415927.
var hex_a = 0x10101
var hex_b = 0x8080_0000_ffff  # Equal to 0x80800000ffff.
var binary_a = 0b10101
var binary_b = 0b11_00_11_00  # Equal to 0b11001100.

var sci_float_a = 58.1e-10
var sci_float_b = 58.1e-10

const const_a = 0
const const_b = true
const const_c := true
const const_d : bool = true
const const_e :    bool = true
const const_f:bool=true
const const_g : string = 'foo'
const const_h : string = "foo"

var pls_no_a = "don't do this"; var pls_no_b = "I don't care if it's valid";
var pls_no_c = 0; var pls_no_d = false; var pls_no_e = seriously_why();
var pls_no_f: bool; var pls_no_g: int; var pls_no_h: string;

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

var variant_a = 0
const variant_b = 0

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

# one line functions, please don't actually do this
func one_line_int_fn() -> int: return 3
func one_line_dict_fn() -> int: return {a=0, b=0.0, c='test'}
func one_line_print() -> void: print("Uh oh")
func one_line_fn() -> void: return

# ------------------------------------------------------------------------------

var stringname_nodepath_a = @"test"
var stringname_nodepath_b = @'test'

var q = "double quotes"
var r = 'single quotes'
var s = """
triple double quotes
"""
var t = '''triple single quotes'''

# ------------------------------------------------------------------------------

var IS_CONSTANT
var not_CONSTANT
var ALSO_NOT_constant
var CONSTANT_not

# ------------------------------------------------------------------------------

var node_a = $Child
var node_b = $Child/GrandChild
var node_bb = $Child/GrandChild/GreatGrandChild
var node_bbb = $Child/GrandChild/GreatGrandChild/GreatGreatGrandChild
var node_c = $"../Sibling"
var node_cc = $'../Sibling'
var node_d = $'..' # parent
var node_e = $"../.." # grandparent

var node_f = get_node('Child')
var node_g = get_node("Child/GrandChild")
var node_h = get_node("../Sibling")

if has_node('Child') and get_node('Child').has_node('GrandChild'):
	pass

var unique_node_a = $%Unique
var unique_node_b = $Child/%Unique
var unique_node_c = $Child/GrandChild/%Unique
var unique_node_d = $Child/%Unique/ChildOfUnique
var unique_node_e = %Unique
var unique_node_f = %Unique/Child
var unique_node_g = %Unique/%UniqueChild

var a = $/root
var a = $/ root
var a = $/root/Child
var a = $/ root/   Child
var a = $/root/Child/%Unique
var a = $ /  root /   Child/%Unique
var a = $/root/Child/GrandChild

var node_i = $"%Unique"
var node_ii = get_node("%Unique")
var node_iii = NodePath("%Unique")
var node_j = $'%Unique/Child'
var node_jj = get_node('%Unique/Child')
var node_jjj = NodePath('%Unique/Child')
var node_k = $"%Unique/%UniqueChild"
var node_kk = get_node("%Unique/%UniqueChild")
var node_kkk = NodePath("%Unique/%UniqueChild")

if has_node('%Unique') and get_node('%Child').has_node('%GrandChild'):
	pass

var node_i = $badlyNamedChild
var node_j = $badlyNamedChild/badly_named_grandchild

var node_path_a = NodePath("Child")
var node_path_b = NodePath('Child/GrandChild')
var node_path_c = NodePath('../Sibling')

var node_method_result_a = get_node("Child").some_method()
var node_method_result_b = get_node("Child/GrandChild").some_method()
var node_method_result_c = get_node("%Child").some_method()
var node_method_result_d = $Child.some_method()
var node_method_result_e = $'Child'.some_method()
var node_method_result_f = $'%Child'.some_method()
var node_method_result_g = $Child/GrandChild.some_method()
var node_method_result_h = $"Child/GrandChild".some_method()
var node_method_result_i = $"%Child/GrandChild".some_method()
var node_method_result_j = $Child.get_node('GrandChild').some_method()
var node_method_result_k = $"Child".get_node('GrandChild').some_method()
var node_method_result_l = $"%Child".get_node('GrandChild').some_method()

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

	if some_bool: return

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

	dict = {}

	var dict_b = {
		1: true,
		4: true,
		6: true
	}

	func _ready():
		var list = []

		for i in range(10): # "in" should be purple (control flow)
			list.append(i)

		for child in get_children():
			print(child)
			
		for    child   in    get_children():
			print(child)

		if true and true:
			pass
		elif 'foo' in list: # "in" should be blue (boolean operator)
			pass
		elif false:
			while true:
				pass
		else:
			pass
		
		pass

# ------------------------------------------------------------------------------

func test_function():
	OS.get_name()
