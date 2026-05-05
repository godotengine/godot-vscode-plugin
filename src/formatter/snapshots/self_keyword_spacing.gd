# --- IN ---
# Bug #976: extra space before self after ! or [
func f():
	if !self.member == 1:
		pass
	var array = [self.member]
	var b = !self
	var c = [self]
	var d = (self)
	print(self.c + 2)
# --- OUT ---
# Bug #976: extra space before self after ! or [
func f():
	if !self.member == 1:
		pass
	var array = [self.member]
	var b = !self
	var c = [self]
	var d = (self)
	print(self.c + 2)