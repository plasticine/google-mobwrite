#!/usr/bin/python
"""MobWrite Sync

Copyright 2009 Google Inc.
http://code.google.com/p/google-mobwrite/

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

"""This command-line program synchronizes a file with a MobWrite server.

First create a three-line config file formatted like this:
serverurl=http://mobwrite3.appspot.com/scripts/q.py
filename=demo
localfile=/home/username/demo.txt
Then call this script with the config file as the argument.  The specified
local file (demo.txt) will be synchronized against the specified MobWrite
server.  After the first execution, the config file will have several lines of
state properties added to it.

Warning: No checks are made on the config file to prevent malicious data input.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import mobwritelib
import sys

class syncShareObject(shareObject)
  def __init__(self, username, filename):
    # Setup this object
    self.username = username
    self.filename = filename
    self.shadow_text = u""
    self.shadow_client_version = 0
    self.shadow_server_version = 0
    self.edit_stack = []
    self.text = u""

def loadData(configfile):
  configdata = ShareObj()
  # Load the data from the configuration file.
  f = open(configfile)
  try:
    for line in f:
      div = line.find("=")
      if div > 0:
        name = line[:div].strip()
        value = line[div + 1:].strip("\r\n")
        if name:
          configdata[name] = value
  finally:
    f.close()

  # Load the main text from the text file.
  if configdata.has_key("filename"):
    lines = []
    try:
      f = open(configdata["filename"])
      try:
        lines = f.readlines()
      finally:
        f.close()
    except IOError:
      pass
    configdata["text"] = "".join(lines)

  # Unescape the shadow text.
  if configdata.has_key("shadowtext"):
    configdata["shadowtext"] = urllib.unquote(configdata["shadowtext"])

  return configdata


def saveData(configfile, configdata):
  # Escape the shadow text.
  if configdata.has_key("shadowtext"):
    configdata["shadowtext"] = urllib.quote(configdata["shadowtext"])

  # Save the main text to the text file.
  if configdata.has_key("filename"):
    f = open(configdata["filename"], "w")
    try:
      f.write(configdata.get("text", ""))
    finally:
      f.close()
    if (configdata.has_key("text")):
      del configdata["text"]

  # Save the data to the configuration file.
  f = open(configfile, "w")
  try:
    for name in configdata:
      f.write("%s=%s\n" % (name, configdata[name]))
  finally:
    f.close()


if __name__ == "__main__":
  # Obtain the configuration file from the command line argument.
  if len(sys.argv) != 2:
    print >> sys.stderr, "Usage:  %s <CONFIGFILE>" % sys.argv[0]
    print >> sys.stderr, "  E.g.  %s demo.cfg" % sys.argv[0]
    sys.exit(2)
  configfile = sys.argv[1]
  configdata = loadData(configfile)
  for manditory in ["serverurl", "filename", "localfile"]:
    if not configdata.get(manditory, None):
      sys.exit("Error: '%s' line not found in %s." % (manditory, configfile))

  success = mobwritelib.syncBlocking(configdata["serverurl"], [configdata])
  if not success:
    sys.exit("Error: MobWrite server failed to respond.")

  saveData(configfile, configdata)
