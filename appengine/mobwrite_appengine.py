#!/usr/bin/python2.4

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

"""This file is the server, running under Google App Engine.

Accepting synchronization sessions from clients.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import cgi
import datetime
import sys
import urllib

from google.appengine.ext import db
from google.appengine import runtime

sys.path.insert(0, "lib")
import mobwrite_core
del sys.path[0]


class TextObj(mobwrite_core.TextObj, db.Model):
  # An object which stores a text.

  # Object properties:
  # .lasttime - The last time that this text was modified.

  # Inerhited properties:
  # .name - The unique name for this text, e.g 'proposal'.
  # .text - The text itself.
  # .changed - Has the text changed since the last time it was saved.

  text = db.TextProperty()
  lasttime = db.DateTimeProperty(auto_now=True)

  def __init__(self, *args, **kwargs):
    # Setup this object
    mobwrite_core.TextObj.__init__(self, *args, **kwargs)
    db.Model.__init__(self, *args, **kwargs)

  def setText(self, newtext):
    mobwrite_core.TextObj.setText(self, newtext)

    if (not self.changed and
        self.lasttime + mobwrite_core.TIMEOUT_TEXT <
        datetime.datetime.now() + mobwrite_core.TIMEOUT_VIEW):
      # Text object will expire before its view.  Bump the database.
      self.changed = True
      mobwrite_core.LOG.info("Keep-alive save for TextObj: '%s'" % self.key().name())

    if self.changed:
      self.put()
      if newtext == None:
        mobwrite_core.LOG.debug("Nullified TextObj: '%s'" % self.key().name())
      else:
        mobwrite_core.LOG.debug("Saved %db TextObj: '%s'" %
            (len(newtext), self.key().name()))
      self.changed = False

  def safe_name(unsafe_name):
    # DataStore doesn't like names starting with numbers.
    return "_" + unsafe_name
  safe_name = staticmethod(safe_name)

def fetchText(name):
  filename = TextObj.safe_name(name)
  textobj = TextObj.get_or_insert(filename)
  if textobj.text == None:
    mobwrite_core.LOG.debug("Loaded null TextObj: '%s'" % filename)
  else:
    mobwrite_core.LOG.debug("Loaded %db TextObj: '%s'" %
        (len(textobj.text), filename))
  return textobj


class ViewObj(mobwrite_core.ViewObj, db.Model):
  # An object which contains one user's view of one text.

  # Object properties:
  # .edit_stack - List of unacknowledged edits sent to the client.
  # .lasttime - The last time that a web connection serviced this object.
  # .textobj - The shared text object being worked on.

  # Inerhited properties:
  # .username - The name for the user, e.g 'fraser'
  # .filename - The name for the file, e.g 'proposal'
  # .shadow - The last version of the text sent to client.
  # .backup_shadow - The previous version of the text sent to client.
  # .shadow_client_version - The client's version for the shadow (n).
  # .shadow_server_version - The server's version for the shadow (m).
  # .backup_shadow_server_version - the server's version for the backup
  #     shadow (m).

  username = db.StringProperty(required=True)
  filename = db.StringProperty(required=True)
  shadow = db.TextProperty()
  backup_shadow = db.TextProperty()
  shadow_client_version = db.IntegerProperty(required=True)
  shadow_server_version = db.IntegerProperty(required=True)
  backup_shadow_server_version = db.IntegerProperty(required=True)
  edit_stack = db.TextProperty()
  lasttime = db.DateTimeProperty(auto_now=True)
  textobj = db.ReferenceProperty(TextObj)

  def __init__(self, *args, **kwargs):
    # Setup this object
    mobwrite_core.ViewObj.__init__(self, *args, **kwargs)
    # The three version numbers are required when defining a db.Model
    kwargs["shadow_client_version"] = self.shadow_client_version
    kwargs["shadow_server_version"] = self.shadow_server_version
    kwargs["backup_shadow_server_version"] = self.backup_shadow_server_version
    db.Model.__init__(self, *args, **kwargs)

  def nullify(self):
    mobwrite_core.LOG.debug("Nullified ViewObj: '%s'" % self.key().name())
    self.delete()

def fetchUserViews(username):
  query = db.GqlQuery("SELECT * FROM ViewObj WHERE username = :1", username)
  # Convert list to a hash.
  views = {}
  for viewobj in query:
    mobwrite_core.LOG.debug("Loaded %db ViewObj: '%s@%s'" %
        (len(viewobj.shadow), viewobj.username, viewobj.filename))
    views[viewobj.filename] = viewobj
  if len(views) == 0:
    mobwrite_core.LOG.debug("Unable to find any ViewObj for: '%s'" % username)
  return views


class BufferObj(db.Model):
  # An object which assembles large commands from fragments.

  # Object properties:
  # [key] - The name (and size) of the buffer, e.g. '_alpha_12'
  # .data - The contents of the buffer.
  # .lasttime - The last time that this buffer was modified.

  data = db.StringListProperty()
  lasttime = db.DateTimeProperty(auto_now=True)


def feedBuffer(name, size, index, datum):
  """Add one block of text to the buffer and return the whole text if the
    buffer is complete.

  Args:
    name: Unique name of buffer object.
    size: Total number of slots in the buffer.
    index: Which slot to insert this text (note that index is 1-based)
    datum: The text to insert.

  Returns:
    String with all the text blocks merged in the correct order.  Or if the
    buffer is not yet complete returns the empty string.
  """
  # Not thread safe -- must be wrapped in a transaction.
  if not 0 < index <= size:
    mobwrite_core.LOG.error("Invalid buffer: '%s %d %d'" % (name, size, index))
    text = ""
  elif size == 1 and index == 1:
    # A buffer with one slot?  Pointless.
    text = datum
    mobwrite_core.LOG.debug("Buffer with only one slot: '%s'" % name)
  else:
    # DataStore doesn't like names starting with numbers.
    name = "_%s_%d" % (name, size)
    key = db.Key.from_path(BufferObj.kind(), name)
    bufferobj = db.get(key)
    # Should be zero or one result.
    if bufferobj == None:
      data = []
      for x in xrange(size):
        data.append("")
      data[index - 1] = datum
      bufferobj = BufferObj(key_name=name, data=data)
      mobwrite_core.LOG.debug("Created new BufferObj: '%s' (%d)" % (name, index))
    else:
      bufferobj.data[index - 1] = datum
      mobwrite_core.LOG.debug("Reloaded existing BufferObj: '%s' (%d)" % (name, index))
    # Check if Buffer is complete.
    if "" in bufferobj.data:
      bufferobj.put()
      return None
    # Strings are stored, but the DB returns it as Unicode.
    text = str("".join(bufferobj.data))
    bufferobj.delete()
  return urllib.unquote(text)


def cleanup():
  def cleanTable(name, limit):
    query = db.GqlQuery("SELECT * FROM %s WHERE lasttime < :1" % name, limit)
    while 1:
      results = query.fetch(maxlimit)
      print "Deleting %d %s(s)." % (len(results), name)
      db.delete(results)
      if len(results) != maxlimit:
        break
  
  mobwrite_core.LOG.info("Cleaning database")
  maxlimit = 1000
  try:
    # Delete any view which hasn't been written to in a while.
    limit = datetime.datetime.now() - mobwrite_core.TIMEOUT_VIEW
    cleanTable("ViewObj", limit)

    # Delete any text which hasn't been written to in a while.
    limit = datetime.datetime.now() - mobwrite_core.TIMEOUT_TEXT
    cleanTable("TextObj", limit)

    # Delete any buffer which hasn't been written to in a while.
    limit = datetime.datetime.now() - mobwrite_core.TIMEOUT_BUFFER
    cleanTable("BufferObj", limit)

    print "Database clean."
    mobwrite_core.LOG.info("Database clean")
  except runtime.DeadlineExceededError:
    print "Cleanup only partially complete.  Deadline exceeded."
    mobwrite_core.LOG.warning("Database only partially cleaned")


def parseRequest(data):
  # Passing a Unicode string is an easy way to cause numerous subtle bugs.
  if type(data) != str:
    mobwrite_core.LOG.critical("parseRequest data type is %s" % type(data))
    return ""
  if not (data.endswith("\n\n") or data.endswith("\r\r") or
          data.endswith("\n\r\n\r") or data.endswith("\r\n\r\n")):
    # There must be a linefeed followed by a blank line.
    # Truncated data.  Abort.
    mobwrite_core.LOG.warning("Truncated data: '%s'" % data)
    return ""

  # Parse the lines
  output = []
  actions = []
  username = None
  filename = None
  server_version = None
  echo_username = False
  for line in data.splitlines():
    if not line:
      # Terminate on blank line.
      break
    if line.find(":") != 1:
      # Invalid line.
      continue
    (name, value) = (line[:1], line[2:])

    # Parse out a version number for file, delta or raw.
    version = None
    if ("FfDdRr".find(name) != -1):
      div = value.find(":")
      if div > 0:
        try:
          version = int(value[:div])
        except ValueError:
          mobwrite_core.LOG.warning("Invalid version number: %s" % line)
          continue
        value = value[div + 1:]
      else:
        mobwrite_core.LOG.warning("Missing version number: %s" % line)
        continue

    if name == "b" or name == "B":
      # Decode and store this entry into a buffer.
      try:
        (name, size, index, text) = value.split(" ", 3)
        size = int(size)
        index = int(index)
      except ValueError:
        mobwrite_core.LOG.warning("Invalid buffer format: %s" % value)
        continue
      # Store this buffer fragment.
      text = db.run_in_transaction(feedBuffer, name, size, index, text)
      # Check to see if the buffer is complete.  If so, execute it.
      if text:
        mobwrite_core.LOG.info("Executing buffer: %s_%d" % (name, size))
        # Duplicate last character.  Should be a line break.
        output.append(parseRequest(text + text[-1]))

    elif name == "u" or name == "U":
      # Remember the username.
      username = value
      if name == "U":
        # Client requests explicit usernames in response.
        echo_username = True

    elif name == "f" or name == "F":
      # Remember the filename and version.
      filename = value
      server_version = version

    elif name == "n" or name == "N":
      # Nullify this file.
      filename = value
      if username and filename:
        action = {}
        action["username"] = username
        action["filename"] = filename
        action["mode"] = "null"
        actions.append(action)

    else:
      # A delta or raw action.
      action = {}
      if name == "d" or name == "D":
        action["mode"] = "delta"
      elif name == "r" or name == "R":
        action["mode"] = "raw"
      else:
        action["mode"] = None
      if name.isupper():
        action["force"] = True
      else:
        action["force"] = False
      action["server_version"] = server_version
      action["client_version"] = version
      action["data"] = value
      if username and filename and action["mode"]:
        action["username"] = username
        action["filename"] = filename
        actions.append(action)

  output.append(doActions(actions, echo_username))

  return "".join(output)


def doActions(actions, echo_username):
  output = []
  last_username = None
  last_filename = None
  viewobj = None
  user_views = None

  for action_index in xrange(len(actions)):
    # Use an indexed loop in order to peek ahead on step to detect
    # username/filename boundaries.
    action = actions[action_index]
    username = action["username"]
    filename = action["filename"]

    # Fetch the requested view object.
    if not user_views:
      user_views = fetchUserViews(action["username"])
      viewobj = None
    if not viewobj:
      if user_views.has_key(filename):
        viewobj = user_views[filename]
      else:
        viewobj = ViewObj(username=username, filename=filename)
        mobwrite_core.LOG.debug("Created new ViewObj: '%s@%s'" %
            (viewobj.username, viewobj.filename))
        viewobj.shadow = u""
        viewobj.backup_shadow = u""
        viewobj.edit_stack = ""
        viewobj.textobj = fetchText(filename)
        user_views[filename] = viewobj
      delta_ok = True

    if action["mode"] == "null":
      # Nullify the text.
      mobwrite_core.LOG.debug("Nullifying: '%s@%s'" %
          (viewobj.username, viewobj.filename))
      # Textobj transaction not needed; just a set.
      textobj = viewobj.textobj
      textobj.setText(None)
      viewobj.nullify();
      viewobj = None
      continue

    if (action["server_version"] != viewobj.shadow_server_version and
        action["server_version"] == viewobj.backup_shadow_server_version):
      # Client did not receive the last response.  Roll back the shadow.
      mobwrite_core.LOG.warning("Rollback from shadow %d to backup shadow %d" %
          (viewobj.shadow_server_version, viewobj.backup_shadow_server_version))
      viewobj.shadow = viewobj.backup_shadow
      viewobj.shadow_server_version = viewobj.backup_shadow_server_version
      viewobj.edit_stack = ""

    # Remove any elements from the edit stack with low version numbers which
    # have been acked by the client.
    stack = stringToStack(viewobj.edit_stack)
    x = 0
    while x < len(stack):
      if stack[x][0] <= action["server_version"]:
        del stack[x]
      else:
        x += 1
    viewobj.edit_stack = stackToString(stack)

    if action["mode"] == "raw":
      # It's a raw text dump.
      data = urllib.unquote(action["data"]).decode("utf-8")
      mobwrite_core.LOG.info("Got %db raw text: '%s@%s'" %
          (len(data), viewobj.username, viewobj.filename))
      delta_ok = True
      # First, update the client's shadow.
      viewobj.shadow = data
      viewobj.shadow_client_version = action["client_version"]
      viewobj.shadow_server_version = action["server_version"]
      viewobj.backup_shadow = viewobj.shadow
      viewobj.backup_shadow_server_version = viewobj.shadow_server_version
      viewobj.edit_stack = ""
      # Textobj transaction not needed; in a collision here data-loss is
      # inevitable anyway.
      textobj = viewobj.textobj
      if action["force"] or textobj.text == None:
        # Clobber the server's text.
        if textobj.text != data:
          textobj.setText(data)
          mobwrite_core.LOG.debug("Overwrote content: '%s@%s'" %
              (viewobj.username, viewobj.filename))
    elif action["mode"] == "delta":
      # It's a delta.
      mobwrite_core.LOG.info("Got '%s' delta: '%s@%s'" %
          (action["data"], viewobj.username, viewobj.filename))
      if action["server_version"] != viewobj.shadow_server_version:
        # Can't apply a delta on a mismatched shadow version.
        delta_ok = False
        mobwrite_core.LOG.warning("Shadow version mismatch: %d != %d" %
            (action["server_version"], viewobj.shadow_server_version))
      elif action["client_version"] > viewobj.shadow_client_version:
        # Client has a version in the future?
        delta_ok = False
        mobwrite_core.LOG.warning("Future delta: %d > %d" %
            (action["client_version"], viewobj.shadow_client_version))
      elif action["client_version"] < viewobj.shadow_client_version:
        # We've already seen this diff.
        pass
        mobwrite_core.LOG.warning("Repeated delta: %d < %d" %
            (action["client_version"], viewobj.shadow_client_version))
      else:
        # Expand the delta into a diff using the client shadow.
        try:
          diffs = mobwrite_core.DMP.diff_fromDelta(viewobj.shadow, action["data"])
        except ValueError:
          diffs = None
          delta_ok = False
          mobwrite_core.LOG.warning("Delta failure, expected %d length: '%s@%s'" %
              (len(viewobj.shadow), viewobj.username, viewobj.filename))
        viewobj.shadow_client_version += 1
        if diffs != None:
          # Textobj transaction required for read/patch/write cycle.
          db.run_in_transaction(mobwrite_core.applyPatches, viewobj, diffs,
              action)

    # Generate output if this is the last action or the username/filename
    # will change in the next iteration.
    if ((action_index + 1 == len(actions)) or
        actions[action_index + 1]["username"] != viewobj.username or
        actions[action_index + 1]["filename"] != viewobj.filename):
      output.append(generateDiffs(viewobj,
                                  last_username, last_filename,
                                  echo_username, action["force"],
                                  delta_ok))
      last_username = viewobj.username
      last_filename = viewobj.filename
      # Dereference the cache of user views if the user is changing.
      if ((action_index + 1 == len(actions)) or
          actions[action_index + 1]["username"] != viewobj.username):
        user_views = None
      # Dereference the view object so that a new one can be created.
      viewobj = None

  return "".join(output)


def generateDiffs(viewobj, last_username, last_filename,
                  echo_username, force, delta_ok):
  output = []
  if (echo_username and last_username != viewobj.username):
    output.append("u:%s\n" %  viewobj.username)
  if (last_filename != viewobj.filename or last_username != viewobj.username):
    output.append("F:%d:%s\n" % (viewobj.shadow_client_version, viewobj.filename))

  # Textobj transaction not needed; just a get, stale info is ok.
  textobj = viewobj.textobj
  mastertext = textobj.text

  stack = stringToStack(viewobj.edit_stack)

  if delta_ok:
    if mastertext == None:
      mastertext = ""
    # Create the diff between the view's text and the master text.
    diffs = mobwrite_core.DMP.diff_main(viewobj.shadow, mastertext)
    mobwrite_core.DMP.diff_cleanupEfficiency(diffs)
    text = mobwrite_core.DMP.diff_toDelta(diffs)
    if force:
      # Client sending 'D' means number, no error.
      # Client sending 'R' means number, client error.
      # Both cases involve numbers, so send back an overwrite delta.
      stack.append((viewobj.shadow_server_version,
          "D:%d:%s\n" % (viewobj.shadow_server_version, text)))
    else:
      # Client sending 'd' means text, no error.
      # Client sending 'r' means text, client error.
      # Both cases involve text, so send back a merge delta.
      stack.append((viewobj.shadow_server_version,
          "d:%d:%s\n" % (viewobj.shadow_server_version, text)))
    viewobj.shadow_server_version += 1
    mobwrite_core.LOG.info("Sent '%s' delta: '%s@%s'" %
        (text, viewobj.username, viewobj.filename))
  else:
    # Error; server could not parse client's delta.
    # Send a raw dump of the text.
    viewobj.shadow_client_version += 1
    if mastertext == None:
      mastertext = ""
      stack.append((viewobj.shadow_server_version,
          "r:%d:\n" % viewobj.shadow_server_version))
      mobwrite_core.LOG.info("Sent empty raw text: '%s@%s'" %
          (viewobj.username, viewobj.filename))
    else:
      # Force overwrite of client.
      text = mastertext
      text = text.encode("utf-8")
      text = urllib.quote(text, "!~*'();/?:@&=+$,# ")
      stack.append((viewobj.shadow_server_version,
          "R:%d:%s\n" % (viewobj.shadow_server_version, text)))
      mobwrite_core.LOG.info("Sent %db raw text: '%s@%s'" %
          (len(text), viewobj.username, viewobj.filename))

  viewobj.shadow = mastertext
 
  for edit in stack:
    output.append(edit[1])

  mobwrite_core.LOG.debug("Saving %db ViewObj: '%s@%s'" %
      (len(viewobj.shadow), viewobj.username, viewobj.filename))
  viewobj.edit_stack = stackToString(stack)
  viewobj.put()

  return "".join(output)

def stringToStack(string):
  stack = []
  for line in string.split("\n"):
    if line:
      (version, command) = line.split("\t", 1)
      stack.append((int(version), command))
  return stack

def stackToString(stack):
  strings = []
  for (version, command) in stack:
    strings.append(str(version) + "\t" + command)
  return "\n".join(strings)


def main():
  form = cgi.FieldStorage()
  if form.has_key("q"):
    # Client sending a sync.  Requesting text return.
    print "Content-Type: text/plain"
    print ""
    print parseRequest(form["q"].value)
  elif form.has_key("p"):
    # Client sending a sync.  Requesting JS return.
    print "Content-Type: text/javascript"
    print ""
    value = parseRequest(form["p"].value)
    value = value.replace("\\", "\\\\").replace("\"", "\\\"")
    value = value.replace("\n", "\\n").replace("\r", "\\r")
    print "mobwrite.callback(\"%s\");" % value
  elif form.has_key("clean"):
    # External cron job to clean the database.
    print "Content-Type: text/plain"
    print ""
    cleanup()
  else:
    # Unknown request.
    print "Content-Type: text/plain"
    print ""

  mobwrite_core.LOG.debug("Disconnecting.")


if __name__ == "__main__":
  mobwrite_core.logging.basicConfig()
  main()
  mobwrite_core.logging.shutdown()
