# --- IN ---
func f():
	# arithmetic
    x += 1
	x -= 1
	x *= 1
	x /= 1
	x %= 1
	x = 2 ** 2
	x = 2 * -1
	
    # bitwise
    x |= 1
	x &= 1
	x ^= 1
	x ~= 1
	x = ~1
	x /= 1
	x >>= 1
	x <<= 1

	x = 1 << 1 | 1 >> 3
	x = 1 << 1 & 1 >> 3
	x = 1 ^ ~1