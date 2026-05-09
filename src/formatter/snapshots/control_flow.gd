# --- IN ---
if  true :
	pass
elif  false :
	pass
else :
	pass

if  a>  b:
	pass

if  a  is  Node:
	pass

if  a  is  not  Node:
	pass
# --- OUT ---
if true:
	pass
elif false:
	pass
else:
	pass

if a > b:
	pass

if a is Node:
	pass

if a is not Node:
	pass

# --- IN ---
for  i  in  range(10):
	pass

for  item  in  items:
	pass

for  i  in  [1,  2,  3]:
	pass
# --- OUT ---
for i in range(10):
	pass

for item in items:
	pass

for i in [1, 2, 3]:
	pass

# --- IN ---
while  true:
	pass

while  x>  0:
	x  -=  1
# --- OUT ---
while true:
	pass

while x > 0:
	x -= 1

# --- IN ---
var x = a  if  condition  else  b
var y = value  if  x>  0  else  default
# --- OUT ---
var x = a if condition else b
var y = value if x > 0 else default

# --- IN ---
func f():
	pass

func g():
	breakpoint

func h():
	continue

func j():
	break