var a = 10
var b := 10
var c: int = 10

func f(b := 10):
	return func(c := 10):
		pass

func f(b: int = 10):
	return func(c: int = 10):
		pass

func f(b = 10):
	return func(c = 10):
		pass
