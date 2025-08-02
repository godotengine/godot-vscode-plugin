# --- IN ---
var c = 0

func f():
	super()

	const a = preload("res://a.gd")
	const b = load("res://b.gd")

	var origin: Vector2 = Vector2.ZERO
	origin.x = 1
	var andigin: Vector2 = Vector2.ZERO
	andigin.x = 1

	print(a)

	self.c = 1
	print(self.c + 2)
	print(func() return self.c + 2)

	[].append(self)
	var a = self['1']