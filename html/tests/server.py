#!/usr/bin/python2.4

"""Test harness for MobWrite Server (Telnet or HTTP)

Copyright 2009 Google Inc.
http://code.google.com/p/google-diff-match-patch/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

"""
Usage: server.py [-x path_to_xml_file] [-u url]
  E.g. server.py -x server.xml -u http://mobwrite3.appspot.com/scripts/q.py
  E.g. server.py -x server.xml -u telnet://localhost:3017
"""

import getopt
import random
import re
import socket
import sys
import telnetlib
import unittest
import urllib
from xml.dom.minidom import parse, parseString

URL = "telnet://localhost:3017"
XML = "server.xml"

QUESTION = "QUESTION"
ANSWER = "ANSWER"

def getText(nodelist):
  text = ""
  for node in nodelist:
    if node.nodeType == node.TEXT_NODE:
      text += node.data
  return text

# XML often looks like:
#   <XML>
# foobar
#   <XML>
# Convert "\nfoobar\n  " to "foobar\n"
# Also replace [RANDOM] with the random ID for this session.
def formatText(text, randomId):
  text = text.rstrip("\t ")
  text = re.compile("^\s*(\n\r|\r\n|\r|\n)").sub("", text)
  text = text.replace("[RANDOM]", randomId)
  return text

# Parse the input XML file and return a list of test questions and answers.
def parseXml(filename):
  # Parse the XML file.
  dom = parse(filename)

  # Parse each of the tests.
  conversations = []
  tests = dom.getElementsByTagName("TEST")
  for test in tests:
    name = test.getAttribute("NAME")
    conversation = []
    randomId = str(random.random())[2:]
    for child in test.childNodes:
      if child.nodeType == child.ELEMENT_NODE:
        if child.tagName == QUESTION or child.tagName == ANSWER:
          text = formatText(getText(child.childNodes), randomId)
          conversation.append((child.tagName, text))
    conversations.append((name, conversation))
  return conversations


class MobWriteServerTest(unittest.TestCase):

  def session(self, conversation):
    response = None
    for (direction, text) in conversation:
      if direction == QUESTION:
        response = self.send(URL, str(text))
        if response == "\n":
          response = ""
      elif direction == ANSWER:
        self.assertEquals(text, response)
        response = None

  def send(self, url, commands):
    """Send some raw commands to a MobWrite server, return the raw answer.

    Args:
      url: An http or telnet URL to a MobWrite server.
          e.g. "http://mobwrite3.appspot.com/scripts/q.py"
          e.g. "telnet://localhost:3017"
      commands: All the commands for this session.
          e.g. "u:123\nf:0:demo\nd:0:=12\n\n"

    Returns:
      The raw output from the server.
          e.g. "f:0:demo\nd:0:=12\n\n"
    """
    # print "Sending: %s" % commands
    data = ""
    if url.startswith("telnet://"):
      url = url[9:]
      # Determine the port (default to 23)
      div = url.find(":")
      port = 23
      if div != -1:
        host = url[:div]
        try:
          port = int(url[div + 1:])
        except ValueError:
          pass
      # Execute a telnet connection.
      # print "Connecting to: %s:%s" % (host, port)
      t = telnetlib.Telnet(host, port)
      t.write(commands)
      data = t.read_all() + "\n"
      t.close()
    else:
      # Web connection.
      params = urllib.urlencode({"q": commands})
      f = urllib.urlopen(url, params)
      data = f.read()

    data = data.decode("utf-8")
    # print "Got: %s" % data
    return data


def main():
  print "Testing %s against %s" % (XML, URL)

  conversations = parseXml(XML)
  print "Loaded %d tests." % len(conversations)

  # Dynamically create test methods for each conversation.
  for (name, conversation) in conversations:
    testname = "test" + name.replace(" ", "_")
    def testfunc(conversation):
      return lambda self: self.session(conversation)
    setattr(MobWriteServerTest, testname, testfunc(conversation))

  unittest.main()


if __name__ == "__main__":
  # Parse command line arguments to set configuration globals.
  try:
    opts, args = getopt.getopt(sys.argv[1:], "u:x:")
  except getopt.GetoptError, err:
    # print help information and exit:
    print str(err) # will print something like "option -a not recognized"
    sys.exit(2)
  for o, a in opts:
    if o == "-u":
      URL = a
    elif o == "-x":
      XML = a
  # Nullify commandline arguments since otherwise unittest will parse them.
  sys.argv = [sys.argv[0]]

  main()

