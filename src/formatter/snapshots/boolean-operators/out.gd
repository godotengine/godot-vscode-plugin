func f():
	print(not true)
	if (not true) and \
		 (not true):
		pass
	print(not true)

func g():
	print(true and (not false) or (true))
	print(true and not false or not (true))

func h():
	print(true && (not false) || (true))
	print(true && not false || not (true))
