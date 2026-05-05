# --- IN ---
func f():
	return(some_value)

func g(): return(some_value)

func f():
	return func(): return false
# --- OUT ---
func f():
	return (some_value)

func g(): return (some_value)

func f():
	return func(): return false
