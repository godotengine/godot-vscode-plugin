
## An `IN` block is fed into the formatter and the output is compared to the `OUT` block

```
# --- IN ---
var  a  =   10
# --- OUT ---
var a = 10
```

## Trailing newlines in `IN` and `OUT` blocks is automatically removed

```
# --- IN ---
var  a  =   10
# --- OUT ---
var a = 10

# --- IN ---
var  b  =   'ten'
# --- OUT ---
var b = 'ten'
```

## An `IN` block by itself will be reused at the `OUT` target

Many test cases can simply be expressed as "do not change this":

```
# --- IN ---
var a = """ {
	level_file: '%s',
	md5_hash: %s,
}
"""
```

## Formatter and test harness options can be controlled with `CONFIG` blocks

This test will fail because `strictTrailingNewlines: true` disables trailing newline removal.

```
# --- CONFIG ---
{"strictTrailingNewlines": true}
# --- IN ---
var  a  =   10
# --- OUT ---
var a = 10

```

## `CONFIG ALL` set the default options moving forward, and `END` blocks allow additional layout flexibility

```
# --- CONFIG ALL ---
{"strictTrailingNewlines": true}

# --- IN ---
var  a  =   10
# --- OUT ---
var a = 10
# --- END ---

# anything I want goes here 

# --- IN ---
var  b  =   'ten'
# --- OUT ---
var b = 'ten'
```

## `CONFIG` blocks override `CONFIG ALL`, and the configs are merged for a given test

This test will pass, because the second test has a `CONFIG` that overrides the `CONFIG ALL` at the top.

```
# --- CONFIG ALL ---
{"strictTrailingNewlines": true}

# --- IN ---
var  a  =   10
# --- OUT ---
var a = 10
# --- END ---

# anything I want goes here 

# --- CONFIG ---
{"strictTrailingNewlines": false}
# --- IN ---
var  b  =   'ten'
# --- OUT ---
var b = 'ten'



# --- IN ---
var  c  =   true
# --- OUT ---
var c = true
```