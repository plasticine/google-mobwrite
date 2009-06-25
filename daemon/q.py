#!/usr/bin/python

"""MobWrite - Real-time Synchronization and Collaboration Service

Copyright 2008 Google Inc.
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

"""This server-side script connects the Ajax client to the Python daemon.

This is a minimal man-in-the-middle script.  No input checking from either side.
Works either as a CGI script or as a mod_python script.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import socket

PORT = 3017

def handler(req):
  if req == None:
    # CGI call
    print 'Content-type: text/plain\n'
    form = cgi.FieldStorage()
  else:
    # mod_python call
    req.content_type = 'text/plain'
    # Publisher mode provides req.form, regular mode does not.
    form = getattr(req, "form", util.FieldStorage(req))

  outStr = '\n'
  if form.has_key('q'):
    # Client sending a sync.  Requesting text return.
    outStr = form['q'].value
  elif form.has_key('p'):
    # Client sending a sync.  Requesting JS return.
    outStr = form['p'].value

  inStr = ''
  s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
  try:
    s.connect(("localhost", PORT))
  except socket.error, msg:
    s = None
  if not s:
    # Python CGI can't connect to Python daemon.
    inStr = '\n'
  else:
    # Timeout if MobWrite daemon dosen't respond in 10 seconds.
    s.settimeout(10.0)
    s.send(outStr)
    while 1:
      line = s.recv(1024)
      if not line:
        break
      inStr += line
    s.close()

  if form.has_key('p'):
    # Client sending a sync.  Requesting JS return.
    inStr = inStr.replace("\\", "\\\\").replace("\"", "\\\"")
    inStr = inStr.replace("\n", "\\n").replace("\r", "\\r")
    inStr = "mobwrite.callback(\"%s\");" % inStr

  if req == None:
    # CGI call
    #print "-Sent-\n"
    #print outStr
    #print "-Received-\n"
    print inStr
  else:
    # mod_python call
    #req.write("-Sent-\n\n")
    #req.write(outStr + "\n")
    #req.write("-Received-\n\n")
    req.write(inStr + "\n")
    return apache.OK


if __name__ == "__main__":
  # CGI call
  import cgi
  handler(None)
else:
  # mod_python call
  from mod_python import apache
  from mod_python import util

