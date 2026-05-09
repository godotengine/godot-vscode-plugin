# --- IN ---
func f(x):
	if x  is  Node:
		pass
	if x  is  not  Node:
		pass
	if x  is  RefCounted:
		pass
	if not x  is  Node:
		pass
	if not  x  is  not  Node:
		pass
# --- OUT ---
func f(x):
	if x is Node:
		pass
	if x is not Node:
		pass
	if x is RefCounted:
		pass
	if not x is Node:
		pass
	if not x is not Node:
		pass

# --- IN ---
var a = x  as  int
var b = y  as  Node
var c = z  as  String
var d = (x  as  int)  +  1
# --- OUT ---
var a = x as int
var b = y as Node
var c = z as String
var d = (x as int) + 1