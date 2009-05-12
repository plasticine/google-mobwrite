<%@ page contentType="text/plain" %><%--
--%><%@ page import="java.net.Socket" %><%--
--%><%@ page import="java.io.OutputStream" %><%--
--%><%@ page import="java.io.InputStream" %><%--
--%><%@ page import="java.io.BufferedInputStream" %><%--
--%><%
/*
# MobWrite - Real-time Synchronization and Collaboration Service
#
# Copyright 2006 Google Inc.
# http://code.google.com/p/google-mobwrite/
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This server-side script connects the Ajax client to the Python daemon.
# This is a minimal man-in-the-middle script.  No input checking from either side.

# JSP MobWrite gateway by Erich Bratton http://bratton.com
*/

Socket socket = null;
try {
  // Connect to python mobwrite daemon
  socket = new Socket("localhost", 3017);
  // Timeout if MobWrite daemon dosen't respond in 10 seconds.
  socket.setSoTimeout(10 * 1000);
  String data;
  if (request.getParameter("q") != null) {
    // Client sending a sync.  Requesting text return.
    data = request.getParameter("q");
  } else if (request.getParameter("p") != null) {
    // Client sending a sync.  Requesting JS return.
    data = request.getParameter("p");
  } else {
    data = "";
  }

  // Write data to daemon
  OutputStream outputStream = socket.getOutputStream();
  outputStream.write(data.getBytes());
  // Read the response from python and copy it to JSP out
  InputStream inputStream = new BufferedInputStream(socket.getInputStream());
  int read;
  data = "";
  while ((read = inputStream.read()) > -1) {
    data += (char)read;
    //System.out.println((char)read);
  }

  if (request.getParameter("p") != null) {
    // Client sending a sync.  Requesting JS return.
    data = data.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
    data = data.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    data = "mobwrite.callback(\"" + data + "\");";
  }

  out.write(data);
  out.write("\n");
} catch (Exception e) {
  out.write("\n");
} finally {
  try {
    if (socket != null) {
      socket.close();
    }
  } catch (Exception e) {
    e.printStackTrace();
  }
}
%>
