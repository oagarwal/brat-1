#!/usr/bin/python

from cgi import FieldStorage
from os import listdir
from re import split, sub
from simplejson import dumps
from itertools import chain

datadir = '/data/home/genia/public_html/SharedTask/visual/data/'

def directory_options(directory):
    print "Content-Type: text/html\n"
    print "<option value=''>-- Select Document --</option>"
    dirlist = [file[0:-4] for file in listdir(directory)
            if file.endswith('txt')]
    dirlist.sort()
    for file in dirlist:
        print "<option>%s</option>" % file

def document_json(document):
    print "Content-Type: application/json\n"
    from_offset = 0
    to_offset = None

    text = open(document + ".txt", "rb").read()
    text = sub(r'\. ([A-Z])',r'.\n\1', text)
    struct = {
            "offset": from_offset,
            "text": text,
            "entities": [],
            "events": [],
            "triggers": [],
            "modifications": [],
            }

    triggers = dict()
    iter = None
    try:
        iter = open(document + ".a1", "rb").readlines()
    except:
        pass
    try:
        moreiter = open(document + ".a2", "rb").readlines()
        iter = chain(iter, moreiter)
    except:
        iter = moreiter

    for line in iter:
        tag = line[0]
        row = split('\s+', line)
        if tag == 'T':
            struct["entities"].append(row[0:4])
        elif tag == 'E':
            roles = [split(':', role) for role in row[1:] if role]
            triggers[roles[0][1]] = True
            # Ignore if no trigger
            if roles[0][1]:
                event = [row[0], roles[0][1], roles[1:]]
                struct["events"].append(event)
        elif tag == "M":
            struct["modifications"].append(row[0:3])
        elif tag == "*":
            pass # TODO
            # event = ['*' + row[2] + row[3], row[2], [[row[1], row[3]]]]
            # struct["events"].append(event)
    triggers = triggers.keys()
    struct["triggers"] = [entity for entity in struct["entities"] if entity[0] in triggers]
    struct["entities"] = [entity for entity in struct["entities"] if entity[0] not in triggers]
    print dumps(struct, sort_keys=True, indent=2)

def main():
    params = FieldStorage()
    directory = params.getvalue('directory')
    document = params.getvalue('document')
    if document is None:
        input = directory
    else:
        input = directory + document
    if input.find('/') != -1:
        print "Content-Type: text/html\n"
        return
    directory = datadir + directory

    if document is None:
        directory_options(directory)
    else:
        document_json(directory + '/' + document)

main()