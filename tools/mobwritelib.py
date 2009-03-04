#!/usr/bin/python

"""MobWrite Library

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

"""Helper functions for interfacing with MobWrite

A collection of functions useful for creating 3rd party programs which
talk with MobWrite.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import random
import telnetlib
import urllib

def download(url, filenames):
  """Download one or more files from a MobWrite server.

  Args:
    url: An http or telnet URL to a MobWrite server.
        e.g. "http://mobwrite3.appspot.com/scripts/q.py"
        e.g. "telnet://localhost:3017"
    filenames: A list of filenames to request.
        e.g. ["title", "text"]

  Returns:
    A dictionary objects mapping file names with file contents.
        e.g. {"title": "My Cat", "text": "Once upon a time..."}
  """
  q = ["u:%s" % uniqueId()]
  for filename in filenames:
    q.append("f:0:%s\nr:0:" % filename)
  q.append("\n")  # Trailing blank line required.
  q = "\n".join(q)

  data = send(url, q)

  results = {}
  if (data.endswith("\n\n") or data.endswith("\r\r") or
      data.endswith("\n\r\n\r") or data.endswith("\r\n\r\n")):
    # There must be a linefeed followed by a blank line.

    filename = None
    for line in data.splitlines():
      if not line:
        # Terminate on blank line.
        break
      if line.find(":") != 1:
        # Invalid line.
        continue
      (name, value) = (line[:1], line[2:])

      # Trim off the version number from file, delta or raw.
      if ("FfDdRr".find(name) != -1):
        div = value.find(":")
        if div == -1:
          continue
        value = value[div + 1:]

      if name == "f" or name == "F":
        # Remember the filename.
        filename = value
      elif filename and (name == "d" or name == "D"):
        # When sent a 'r:' command, the server is expected to reply with 'd:'.
        if value == "=0":
          text = ""
        elif value and value[0] == "+":
          text = urllib.unquote(value[1:])
        results[filename] = text
      elif filename and (name == "r" or name == "R"):
        # The server should not reply with 'r:', but if it does, the answer is
        # just as informative as 'd:'.
        results[filename] = urllib.unquote(value)

  return results 

def upload(url, dictionary):
  """Upload one or more files from a MobWrite server.

  Args:
    url: An http or telnet URL to a MobWrite server.
        e.g. "http://mobwrite3.appspot.com/scripts/q.py"
        e.g. "telnet://localhost:3017"
    dictionary: A dictionary with filenames as the keys and content as the data.
        e.g. {"title": "My Cat", "text": "Once upon a time..."}

  Returns:
    True or false, depending on whether the MobWrite server answered.
  """
  q = ["u:%s" % uniqueId()]
  for filename in dictionary:
    data = dictionary[filename]
    # High ascii will raise UnicodeDecodeError.  Use Unicode instead.
    data = data.encode("utf-8")
    data = urllib.quote(data, "!~*'();/?:@&=+$,# ")
    q.append("f:0:%s\nR:0:%s" % (filename, data))
  q.append("\n")  # Trailing blank line required.
  q = "\n".join(q)

  data = send(url, q)
  # Ignore the response, but check that there is one.
  # Maybe in the future this should parse and verify the answer?
  return data.strip() != ""

class ShareObj:
  # An object which contains one user's view of one text.

  # Object properties:
  # .username - The name for the user, e.g. 'fraser'
  # .filename - The name for the file, e.g 'proposal'
  # .shadow_text - The last version of the text sent to client.
  # .shadow_client_version - The client's version for the shadow (n).
  # .shadow_server_version - The server's version for the shadow (m).
  # .edit_stack - List of unacknowledged edits sent to the client.
  # .merge_changes - Synchronization mode; True for text, False for numbers.
  # .text - The client's version of the text.

  def __init__(self, username, filename):
    # Setup this object
    self.username = username
    self.filename = filename
    self.shadow_text = u""
    self.shadow_client_version = 0
    self.shadow_server_version = 0
    self.edit_stack = []
    self.text = u""

def send(url, commands):
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

def uniqueId():
  """Return a random id that's 8 letters long.
  26*(26+10+4)^7 = 4,259,840,000,000

  Returns:
    Random id.
  """
  # First character must be a letter.
  # IE is case insensitive (in violation of the W3 spec).
  soup = "abcdefghijklmnopqrstuvwxyz"
  id = soup[random.randint(0, len(soup) - 1)]
  # Subsequent characters may include these.
  soup += '0123456789-_:.'
  for x in range(7):
    id += soup[random.randint(0, len(soup) - 1)]
  # Don't allow IDs with '--' in them since it might close a comment.
  if id.find("--") != -1:
    id = uniqueId();
  return id
  # Getting the maximum possible density in the ID is worth the extra code,
  # since the ID is transmitted to the server a lot."
