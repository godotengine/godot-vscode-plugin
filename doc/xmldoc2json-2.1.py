#!/usr/bin/python
import sys
import xml.etree.ElementTree as ET
import json

def parseClass(data):
    dictCls = dict(data.attrib)
    dictCls['brief_description'] = data.find("brief_description").text.strip()
    dictCls['description'] = data.find("description").text.strip()
    dictCls['methods'] = []
    for m in data.find("methods"):
        dictCls['methods'].append(parseMethod(m))
    dictCls['signals'] = []
    for s in (data.find("signals") if data.find("signals") is not None else []):
        dictCls['signals'].append(parseMethod(s))
    dictCls['constants'] = []
    for c in (data.find("constants") if data.find("constants") is not None else []):
        dictCls['constants'].append(parseConstant(c))
    dictCls['properties'] = []
    for m in (data.find("members") if data.find("members") is not None else []):
        dictCls['properties'].append(parseProperty(m))
    dictCls['theme_properties'] = []
    for thi in (data.find("theme_items") if data.find("theme_items") is not None else []):
        dictCls['theme_properties'].append(parseProperty(thi))
    return dictCls

def parseMethod(data):
    dictMethod = dict(data.attrib)
    dictMethod['description'] = data.find("description").text.strip()
    dictMethod['return_type'] = data.find("return").attrib["type"] if data.find("return") is not None else ""
    if "qualifiers" not in dictMethod:  dictMethod["qualifiers"] = ""
    dictMethod["arguments"] = []
    for arg in data.iter('argument'):
        dictMethod["arguments"].append(parseArgument(arg))
    return dictMethod

def parseArgument(data):
    dictArg = dict(data.attrib)
    if "dictArg" in dictArg: dictArg.pop("index")
    dictArg["default_value"] = dictArg["default"] if "default" in dictArg else ""
    if "default" in dictArg: dictArg.pop("default")
    return dictArg

def parseConstant(data):
    dictConst = dict(data.attrib)
    dictConst["description"] = data.text.strip()
    return dictConst

def parseProperty(data):
    dictProp = dict(data.attrib)
    dictProp["description"] = data.text.strip()
    return dictProp

def main():
    if len(sys.argv) >=2 :
        tree = ET.parse(open(sys.argv[1], 'r'))
        classes = {}
        for cls in tree.getroot():
            dictCls = parseClass(cls)
            classes[dictCls['name']] = dictCls
        jsonContent = json.dumps({"classes": classes, "version": "2.1.4"}, ensure_ascii=False, indent=2)
        print(jsonContent)

if __name__ == '__main__':
    main()

