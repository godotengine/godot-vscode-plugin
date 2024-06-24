var a = 1
var b = 2

func f():
	a = a + b
	a = .1 + 2
	a = 1. + 2
	a = 1.0 + .2
	a = 1.0 + 2.

	a = a - b
	a = .1 - 2
	a = 1. - 2
	a = 1.0 - .2
	a = 1.0 - 2.

	a = a / b
	a = .1 / 2
	a = 1. / 2
	a = 1.0 / .2
	a = 1.0 / 2.

	a = a * b
	a = .1 * 2
	a = 1. * 2
	a = 1.0 * .2
	a = 1.0 * 2.

	a = 10 ** 10
	a = min(10, 10 ** 10)

	a = a % b
	a = 1 % 2

	a = -1
	a = +1

	a = ((-1 + 2) * (3 - 4) / 5 * 6 % (-7 + 8 - 9 - 10)) * (-11 + 12) / (13 * 14 % 15 + 16)

	var v = Vector2(1, -1)
	var w = Vector2(1, 10 - 1)

	print(-1)
	print(1 - 1)

	print(-1 + (1 - 1))
	print(-1 + (-1 - 1))

	if a > -1:
		if a < -1:
			if a == -1:
				pass

	return -1
