#!/usr/bin/python2.4

"""MobWrite - Real-time Synchronization and Collaboration Service

Copyright 2008 Neil Fraser
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

import logging
import cgi
import urllib
import datetime
import re
import diff_match_patch as dmp_module
from google.appengine.ext import db
from google.appengine import runtime

# Demo usage should limit the maximum size of any text.
# Set to 0 to disable limit.
MAX_CHARS = 50000

# Global Diff/Match/Patch object.
DMP = dmp_module.diff_match_patch()

# Delete any view which hasn't been accessed in half an hour.
TIMEOUT_VIEW = datetime.timedelta(minutes=30)

# Delete any text which hasn't been accessed in an hour.
# TIMEOUT_TEXT should be about twice the length of TIMEOUT_VIEW
TIMEOUT_TEXT = TIMEOUT_VIEW * 2

# Delete any buffer which hasn't been written to in a quarter of an hour.
TIMEOUT_BUFFER = datetime.timedelta(minutes=15)


class TextObj(db.Model):
  # An object which stores a text.

  # Object properties:
  # .text - The text itself.
  # .lasttime - The last time that this text was modified.

  text = db.TextProperty()
  lasttime = db.DateTimeProperty(auto_now=True)

  def setText(self, text):
    # Scrub the text before setting it.
    # Keep the text within the length limit.
    if MAX_CHARS != 0 and len(text) > MAX_CHARS:
       text = text[-MAX_CHARS:]
       logging.warning("Truncated text to %d characters." % MAX_CHARS)
    # Normalize linebreaks to CRLF.
    text = re.sub(r"(\r\n|\r|\n)", "\r\n", text)
    if (self.text != text):
      self.text = text
      self.put()
      logging.debug("Saved %db TextObj: '%s'" % (len(text), self.key().name()))


def fetchText(name):
  # DataStore doesn't like names starting with numbers.
  filename = "_" + name
  key = db.Key.from_path(TextObj.kind(), filename)
  textobj = db.get(key)
  # Should be zero or one result.
  if textobj != None:
    logging.debug("Loaded %db TextObj: '%s'" % (len(textobj.text), filename))
  else:
    logging.debug("Created new TextObj: '%s'" % filename)
    textobj = TextObj(key_name=filename)
  return textobj


class ViewObj(db.Model):
  # An object which contains one user's view of one text.

  # Object properties:
  # .username - The name for the user, e.g 'fraser'
  # .filename - The name for the file, e.g 'proposal'
  # .shadow - The last version of the text sent to client.
  # .backup_shadow - The previous version of the text sent to client.
  # .shadow_client_version - The client's version for the shadow (n).
  # .shadow_server_version - The server's version for the shadow (m).
  # .backup_shadow_server_version - the server's version for the backup
  #     shadow (m).
  # .edit_stack - List of unacknowledged edits sent to the client.
  # .lasttime - The last time (in seconds since 1970) that a web connection
  #     serviced this object.
  # .textobj - The shared text object being worked on.

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


def fetchUserViews(username):
  query = db.GqlQuery("SELECT * FROM ViewObj WHERE username = :1", username)
  # Convert list to a hash, and also load the associated text objects.
  views = {}
  for viewobj in query:
    logging.debug("Loaded %db ViewObj: '%s %s'" %
        (len(viewobj.shadow), viewobj.username, viewobj.filename))
    views[viewobj.filename] = viewobj
  if len(views) == 0:
    logging.debug("Unable to find any ViewObj for: '%s'" % username)
  return views


class BufferObj(db.Model):
  # An object which assembles large commands from fragments.

  # Object properties:
  # [key] - The name (and size) of the buffer, e.g. '_alpha_12'
  # .data - The contents of the buffer.
  # .lasttime - The last time that this buffer was modified.

  data = db.StringListProperty()
  lasttime = db.DateTimeProperty(auto_now=True)


def setToBuffer(name, size, index, datum):
  # Not thread safe -- must be wrapped in a transaction.
  # Note that 'index' is 1-based.
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
    logging.debug("Created new BufferObj: '%s' (%d)" % (name, index))
  else:
    bufferobj.data[index - 1] = datum
    logging.debug("Reloaded existing BufferObj: '%s' (%d)" % (name, index))
  bufferobj.put()


def getFromBuffer(name, size):
  # DataStore doesn't like names starting with numbers.
  name = "_%s_%d" % (name, size)
  key = db.Key.from_path(BufferObj.kind(), name)
  bufferobj = db.get(key)
  # Should be zero or one result.
  if bufferobj == None or "" in bufferobj.data:
    return None
  # Strings are stored, but the DB returns it as Unicode.
  text = str("".join(bufferobj.data))
  bufferobj.delete()
  return urllib.unquote(text)


def cleanup():
  logging.info("Cleaning database")
  try:
    # Delete any view which hasn't been written to in half an hour.
    limit = datetime.datetime.now() - TIMEOUT_VIEW
    query = db.GqlQuery("SELECT * FROM ViewObj WHERE lasttime < :1", limit)
    for datum in query:
      print "Deleting '%s %s' ViewObj" % (datum.username, datum.filename)
      datum.delete()

    # Delete any text which hasn't been written to in an hour.
    limit = datetime.datetime.now() - TIMEOUT_TEXT
    query = db.GqlQuery("SELECT * FROM TextObj WHERE lasttime < :1", limit)
    for datum in query:
      print "Deleting '%s' TextObj" % datum.key().id_or_name()
      datum.delete()

    # Delete any buffer which hasn't been written to in a quarter of an hour.
    limit = datetime.datetime.now() - TIMEOUT_BUFFER
    query = db.GqlQuery("SELECT * FROM BufferObj WHERE lasttime < :1", limit)
    for datum in query:
      print "Deleting '%s' BufferObj" % datum.key().id_or_name()
      datum.delete()

    print "Database clean."
    logging.info("Database clean")
  except runtime.DeadlineExceededError:
    print "Cleanup only partially complete.  Deadline exceeded."
    logging.warning("Database only partially cleaned")


def parseRequest(data):
  # Passing a Unicode string is an easy way to cause numerous subtle bugs.
  if type(data) != str:
    logging.critical("parseRequest data type is %s" % type(data))
    return ""
  if not (data.endswith("\n\n") or data.endswith("\r\r") or
          data.endswith("\n\r\n\r") or data.endswith("\r\n\r\n")):
    # There must be a linefeed followed by a blank line.
    # Truncated data.  Abort.
    logging.warning("Truncated data: '%s'" % data)
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
          logging.warning("Invalid version number: %s" % line)
          continue
        value = value[div + 1:]
      else:
        logging.warning("Missing version number: %s" % line)
        continue

    if name == "b" or name == "B":
      # Decode and store this entry into a buffer.
      try:
        (name, size, index, text) = value.split(" ", 3)
        size = int(size)
        index = int(index)
      except ValueError:
        logging.warning("Invalid buffer format: %s" % value)
        continue
      # Store this buffer fragment.
      db.run_in_transaction(setToBuffer, name, size, index, text)
      # Check to see if the buffer is complete.  If so, execute it.
      text = getFromBuffer(name, size)
      if text:
        logging.info("Executing buffer: %s_%d" % (name, size))
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
        viewobj = ViewObj(username=username, filename=filename,
                          shadow_client_version=0, shadow_server_version=0,
                          backup_shadow_server_version=0)
        logging.debug("Created new ViewObj: '%s %s'" %
            (viewobj.username, viewobj.filename))
        viewobj.shadow = u""
        viewobj.backup_shadow = u""
        viewobj.edit_stack = ""
        viewobj.textobj = fetchText(filename)
        user_views[filename] = viewobj
      delta_ok = True
      textobj = viewobj.textobj


    if (action["server_version"] != viewobj.shadow_server_version and
        action["server_version"] == viewobj.backup_shadow_server_version):
      # Client did not receive the last response.  Roll back the shadow.
      logging.warning("Rollback from shadow %d to backup shadow %d" %
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
      logging.info("Got %db raw text: '%s %s'" %
          (len(data), viewobj.username, viewobj.filename))
      delta_ok = True
      # First, update the client's shadow.
      viewobj.shadow = data
      viewobj.shadow_client_version = action["client_version"]
      viewobj.shadow_server_version = action["server_version"]
      viewobj.backup_shadow = viewobj.shadow
      viewobj.backup_shadow_server_version = viewobj.shadow_server_version
      viewobj.edit_stack = ""
      if action["force"]:
        # Clobber the server's text.
        if textobj.text != data:
          textobj.setText(data)
          logging.debug("Overwrote content: '%s %s'" %
              (viewobj.username, viewobj.filename))
    elif action["mode"] == "delta":
      # It's a delta.
      logging.info("Got '%s' delta: '%s %s'" %
          (action["data"], viewobj.username, viewobj.filename))
      if action["server_version"] != viewobj.shadow_server_version:
        # Can't apply a delta on a mismatched shadow version.
        delta_ok = False
        logging.warning("Shadow version mismatch: %d != %d" %
            (action["server_version"], viewobj.shadow_server_version))
      elif action["client_version"] > viewobj.shadow_client_version:
        # Client has a version in the future?
        delta_ok = False
        logging.warning("Future delta: %d > %d" %
            (action["client_version"], viewobj.shadow_client_version))
      elif action["client_version"] < viewobj.shadow_client_version:
        # We've already seen this diff.
        pass
        logging.warning("Repeated delta: %d < %d" %
            (action["client_version"], viewobj.shadow_client_version))
      else:
        # Expand the delta into a diff using the client shadow.
        try:
          diffs = DMP.diff_fromDelta(viewobj.shadow, action["data"])
        except ValueError:
          diffs = None
          delta_ok = False
          logging.warning("Delta failure, expected %d length: '%s %s'" %
              (len(viewobj.shadow), viewobj.username, viewobj.filename))
        viewobj.shadow_client_version += 1
        if diffs != None:
          # Expand the fragile diffs into a full set of patches.
          patches = DMP.patch_make(viewobj.shadow, diffs)
          # First, update the client's shadow.
          viewobj.shadow = DMP.diff_text2(diffs)
          viewobj.backup_shadow = viewobj.shadow
          viewobj.backup_shadow_server_version = viewobj.shadow_server_version
          # Second, deal with the server's text.
          if textobj.text == None:
            # A view is sending a valid delta on a file we've never heard of.
            textobj.setText("")
          if action["force"]:
            # Clobber the server's text if a change was received.
            if len(diffs) > 1 or diffs[0][0] != DMP.DIFF_EQUAL:
              mastertext = viewobj.shadow
              logging.debug("Overwrote content: '%s %s'" %
                  (viewobj.username, viewobj.filename))
            else:
              mastertext = textobj.text
          else:
            (mastertext, results) = DMP.patch_apply(patches, textobj.text)
            logging.debug("Patched (%s): '%s %s'" %
                (",".join(["%s" % (x) for x in results]),
                 viewobj.username, viewobj.filename))
          if textobj.text != mastertext:
            textobj.setText(mastertext)
          if textobj.lasttime + TIMEOUT_TEXT < viewobj.lasttime + TIMEOUT_VIEW:
            # Text object will expire before this view.  Bump the database.
            textobj.put()
            logging.info("Keep-alive save for TextObj: '%s'" %
                         textobj.key().name())

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
  textobj = viewobj.textobj
  if (echo_username and last_username != viewobj.username):
    output.append("u:%s\n" %  viewobj.username)
  if (last_filename != viewobj.filename or last_username != viewobj.username):
    output.append("F:%d:%s\n" % (viewobj.shadow_client_version, viewobj.filename))

  # Accept this view's version of the text if we've never heard of this
  # text before.
  if textobj.text == None:
    if delta_ok:
      textobj.setText(viewobj.shadow)
    else:
      textobj.setText("")

  mastertext = textobj.text

  stack = stringToStack(viewobj.edit_stack)

  if delta_ok:
    # Create the diff between the view's text and the master text.
    diffs = DMP.diff_main(viewobj.shadow, mastertext)
    DMP.diff_cleanupEfficiency(diffs)
    text = DMP.diff_toDelta(diffs)
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
    logging.info("Sent '%s' delta: '%s %s'" %
        (text, viewobj.username, viewobj.filename))
  else:
    # Error; server could not parse client's delta.
    # Send a raw dump of the text.  Force overwrite of client.
    viewobj.shadow_client_version += 1
    text = mastertext
    text = text.encode("utf-8")
    text = urllib.quote(text, "!~*'();/?:@&=+$,# ")
    stack.append((viewobj.shadow_server_version,
        "R:%d:%s\n" % (viewobj.shadow_server_version, text)))
    logging.info("Sent %db raw text: '%s %s'" %
        (len(text), viewobj.username, viewobj.filename))

  viewobj.shadow = mastertext
 
  for edit in stack:
    output.append(edit[1])

  logging.debug("Saving %db ViewObj: '%s %s'" %
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
  # Choose from: CRITICAL, ERROR, WARNING, INFO, DEBUG
  logging.getLogger().setLevel(logging.DEBUG)

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

  logging.debug("Disconnecting.")


if __name__ == "__main__":
  main()
