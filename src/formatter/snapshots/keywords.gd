# --- IN ---
func f():
	super()
	super.something()
	super(  1,  2  )
# --- OUT ---
func f():
	super()
	super.something()
	super(1, 2)

# --- IN ---
func f():
	const  a = preload("res://a.gd")
	const b = load("res://b.gd")
	const  c = preload(  "res://c.gd"  )
# --- OUT ---
func f():
	const a = preload("res://a.gd")
	const b = load("res://b.gd")
	const c = preload("res://c.gd")

# --- IN ---
func f():
	var origin: Vector2 = Vector2.ZERO
	origin.x = 1
	var andigin: Vector2 = Vector2.ZERO
	andigin.x = 1
# --- OUT ---
func f():
	var origin: Vector2 = Vector2.ZERO
	origin.x = 1
	var andigin: Vector2 = Vector2.ZERO
	andigin.x = 1

# --- IN ---
func f():
	self.c = 1
	print(self.c + 2)
	print(func(): return self.c + 2)
	var list = [self]
	var list2 = [self, self]
	var dict = {self: self}
	print(dict[self])
	print(self)
	print(self, self)
	[].append(self)
	var a = self['1']
# --- OUT ---
func f():
	self.c = 1
	print(self.c + 2)
	print(func(): return self.c + 2)
	var list = [self]
	var list2 = [self, self]
	var dict = {self: self}
	print(dict[self])
	print(self)
	print(self, self)
	[].append(self)
	var a = self['1']

# --- IN ---
# Bug #976: extra space before self after ! or [
func f():
	if !self.member == 1:
		pass
	var array = [self.member]
	var b = !self
	var c = [self]
	var d = (self)
# --- OUT ---
# Bug #976: extra space before self after ! or [
func f():
	if !self.member == 1:
		pass
	var array = [self.member]
	var b = !self
	var c = [self]
	var d = (self)

# --- IN ---
class_name  MyClass
extends  Node
# --- OUT ---
class_name MyClass
extends Node