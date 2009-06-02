#!/usr/bin/python
"""MobWrite Load Tester

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

"""This command-line program fires a large number of requests to a MobWrite
server.

The MobWrite URL and the number of requests per second are provided on the
command line.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import mobwritelib
import random
import sys
import thread
import time

def singleRequest(url):
  # Compute a user name.
  if random.randint(1, 2) == 1:
    # 50% chance of creating a unique user.
    username = "loadtester_" + mobwritelib.uniqueId()
  else:
    # 50% chance of touching an existing user.
    username = "loadtester_shared"
  commands = "U:%s\n" % username

  # Compute a file name.
  if random.randint(1, 2) == 1:
    # 50% chance of creating a unique file.
    filename = "loadtest_" + mobwritelib.uniqueId()
  else:
    # 50% chance of touching an existing file.
    filename = "loadtest_shared"

  mode = random.randint(1, 3)
  if mode == 1:
    # Nullify the file.
    commands += "N:%s\n" % filename
  else:
    commands += "F:0:%s\n" % filename
    if mode == 2:
      # Force a raw dump.
      commands += "R:0:Hello world\n"
    elif mode == 3:
      # Send a delta (maybe valid, maybe not)
      commands += "d:0:+Goodbye world\n"
  commands += "\n"
  
  startTime = time.time()
  results = mobwritelib.send(url, commands)
  endTime = time.time()
  #print commands
  #print results
  delta = endTime - startTime
  print "%f seconds" % delta

def testLoop(url, hertz):
  while 1:
    thread.start_new_thread(singleRequest, (url,))
    time.sleep(1.0 / hertz)

if __name__ == "__main__":
  # Obtain the server URL and the Hertz from the command line argument.
  if len(sys.argv) != 3:
    print >> sys.stderr, "Usage:  %s <URL> <Hertz>" % sys.argv[0]
    print >> sys.stderr, "  E.g.  %s http://mobwrite3.appspot.com/scripts/q.py 5.0" % sys.argv[0]
    print >> sys.stderr, "  E.g.  %s telnet://localhost:3017 5.0" % sys.argv[0]
    sys.exit(2)
  url = sys.argv[1]
  try:
    hertz = float(sys.argv[2])
  except ValueError:
    sys.exit("Error: Hertz must be a number.")

  print "Starting load test."
  try:
    testLoop(url, hertz)
  except KeyboardInterrupt:
    pass
  print "Exiting load test."
