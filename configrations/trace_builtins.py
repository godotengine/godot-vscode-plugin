import json
docdata = json.loads(open("../doc/classes.json").read())

classes = ""
for c in docdata['classes'].keys():
  classes += c + "|"
print(classes)

print("")

builtinfuctions = ''
for m in docdata['classes']['@GDScript']['methods']:
  builtinfuctions += m['name'] +'|'
print(builtinfuctions)

print("")

consts = ''
for c in docdata['classes']['@GDScript']['constants']:
  consts += c['name'] + "|"

for c in docdata['classes']['@Global Scope']['constants']:
  consts += c['name'] + "|"

print consts

print("")

props = ""
for p in docdata['classes']['@Global Scope']['properties']:
  props += p['name'] + "|"

print props