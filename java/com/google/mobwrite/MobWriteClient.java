/**
 * MobWrite - Real-time Synchronization and Collaboration Service
 *
 * Copyright 2009 Google Inc.
 * http://code.google.com/p/google-mobwrite/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.google.mobwrite;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.UnsupportedEncodingException;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import name.fraser.neil.plaintext.diff_match_patch.*;


/**
 * Class representing a MobWrite client.
 */
public class MobWriteClient {
  /**
   * Time to wait for a connection before giving up and retrying.
   */
  public int timeoutInterval = 30000;

  /**
   * Shortest interval (in milliseconds) between connections.
   */
  public int minSyncInterval = 1000;

  /**
   * Longest interval (in milliseconds) between connections.
   */
  public int maxSyncInterval = 10000;

  /**
   * Initial interval (in milliseconds) for connections.
   * This value is modified later as traffic rates are established.
   */
  public int syncInterval = 2000;

  /**
   * Optional prefix to automatically add to all IDs.
   */
  public String idPrefix = "";

  /**
   * Is there a cookie required to access the server.
   */
  public String cookie = null;

  /**
   * Track whether something changed client-side in each sync.
   */
  protected boolean clientChange_ = false;

  /**
   * Track whether something changed server-side in each sync.
   */
  protected boolean serverChange_ = false;

  /**
   * Flag to nullify all shared elements and terminate.
   */
  public boolean nullifyAll = false;

  /**
   * Unique ID for this session.
   */
  protected String syncUsername;

  /**
   * URL of web gateway.
   */
  private String syncGateway;

  /**
   * Hash of all shared objects.
   */
  protected Map<String, ShareObj> shared;

  /**
   * Currently running synchronization thread.
   */
  private Thread syncThread = null;

  /**
   * Number of digits in the username.
   */
  private static final int IDSIZE = 8;

  /**
   * Logging object.
   */
  protected static final Logger logger = Logger.getLogger("MobWrite");

  /**
   * Cryptographically strong pseudo-random number generator. 
   */
  private static final SecureRandom RANDOM = new SecureRandom();
  
  /**
   * Constructor.  Initializes a MobWrite client.
   * @param syncGateway URL of the server.
   */
  public MobWriteClient(String syncGateway) {
    this.syncUsername = MobWriteClient.uniqueId(IDSIZE);
    this.syncGateway = syncGateway;
    logger.log(Level.INFO, "Username: " + this.syncUsername);
    logger.log(Level.INFO, "Gateway: " + this.syncGateway);
    this.shared = new HashMap<String, ShareObj>();
  }


  /**
   * Return the URL of the server.
   * @return URL of the server.
   */
  public String getSyncGateway() {
     return this.syncGateway;
  }


  /**
   * Return a random id.
   * For size = 8: 26*(26+10+4)^7 = 4,259,840,000,000
   * @param size The number of characters to use.
   * @return Random id.
   */
  public static String uniqueId(int size) {
    // First character must be a letter.
    // IE is case insensitive (in violation of the W3 spec).
    String soup = "abcdefghijklmnopqrstuvwxyz";
    StringBuffer sb = new StringBuffer();
    sb.append(soup.charAt(RANDOM.nextInt(soup.length())));
    // Subsequent characters may include these.
    soup += "0123456789-_:.";
    for (int x = 1; x < size; x++) {
      sb.append(soup.charAt(RANDOM.nextInt(soup.length())));
    }
    String id = sb.toString();
    // Don't allow IDs with '--' in them since it might close a comment.
    if (id.indexOf("--") != -1) {
      id = uniqueId(size);
    }
    return id;
    // Getting the maximum possible density in the ID is worth the extra code,
    // since the ID is transmitted to the server a lot.
  }


  /**
   * Collect all client-side changes and send them to the server.
   */
  protected void syncRun1_() {
    // Initialize clientChange_, to be checked at the end of syncRun2_.
    this.clientChange_ = false;
    StringBuilder data = new StringBuilder();
    data.append("u:" + this.syncUsername + '\n');
    boolean empty = true;
    // Ask every shared object for their deltas.
    for (ShareObj share : this.shared.values()) {
      if (this.nullifyAll) {
        data.append(share.nullify());
      } else {
        data.append(share.syncText());
      }
      empty = false;
    }
    if (empty) {
      // No sync objects.
      return;
    }
    if (data.indexOf("\n") == data.lastIndexOf("\n")) {
      // No sync data.
      this.logger.log(Level.INFO, "All objects silent; null sync.");
      this.syncRun2_("\n\n");
      return;
    }

    this.logger.log(Level.INFO, "TO server:\n" + data);
    // Add terminating blank line.
    data.append('\n');

    // Issue Ajax post of client-side changes and request server-side changes.
    StringBuffer buffer = new StringBuffer();
    try {
      // Construct data.
      String q = "q=" + URLEncoder.encode(data.toString(), "UTF-8");
      // Send data.
      URL url = new URL(this.syncGateway);
      URLConnection conn = url.openConnection();
      if (this.cookie != null) {
        conn.setRequestProperty("Cookie", this.cookie);
      }
      conn.setConnectTimeout(this.timeoutInterval);
      conn.setReadTimeout(this.timeoutInterval);
      conn.setDoOutput(true);
      OutputStreamWriter wr = new OutputStreamWriter(conn.getOutputStream());
      wr.write(q);
      wr.flush();

      // Get the response
      BufferedReader rd = new BufferedReader(new InputStreamReader(conn.getInputStream()));
      String line;
      while ((line = rd.readLine()) != null) {
        buffer.append(line).append('\n');
      }
      wr.close();
      rd.close();
    } catch (Exception e) {
      e.printStackTrace();
    }
    this.syncRun2_(buffer.toString());
    // Execution will resume in either syncCheckAjax_(), or syncKill_()
  }


  /**
   * Parse all server-side changes and distribute them to the shared objects.
   * @param text The commands from the server to parse and execute.
   */
  private void syncRun2_(String text) {
    // Initialize serverChange_, to be checked at the end of syncRun2_.
    this.serverChange_ = false;
    this.logger.log(Level.INFO, "FROM server:\n" + text);
    // There must be a linefeed followed by a blank line.
    if (!text.endsWith("\n\n")) {
      text = "";
      this.logger.log(Level.INFO, "Truncated data.  Abort.");
    }
    String[] lines = text.split("\n");
    ShareObj file = null;
    int clientVersion = -1;
    for (String line : lines) {
      if (line.isEmpty()) {
        // Terminate on blank line.
        break;
      }
      // Divide each line into 'N:value' pairs.
      if (line.charAt(1) != ':') {
        this.logger.log(Level.INFO, "Unparsable line: " + line);
        continue;
      }
      char name = line.charAt(0);
      String value = line.substring(2);

      // Parse out a version number for file, delta or raw.
      int version = -1;
      if ("FfDdRr".indexOf(name) != -1) {
        int div = value.indexOf(':');
        if (div == -1) {
          this.logger.log(Level.SEVERE, "No version number: " + line);
          continue;
        }
        try {
          version = Integer.parseInt(value.substring(0, div));
        } catch (NumberFormatException e) {
          this.logger.log(Level.SEVERE, "NaN version number: " + line);
          continue;
        }
        value = value.substring(div + 1);
      }
      if (name == 'F' || name == 'f') {
        // FILE indicates which shared object following delta/raw applies to.
        if (value.substring(0, this.idPrefix.length()).equals(this.idPrefix)) {
          // Trim off the ID prefix.
          value = value.substring(this.idPrefix.length());
        } else {
          // This file does not have our ID prefix.
          file = null;
          this.logger.log(Level.SEVERE, "File does not have \""
              + this.idPrefix + "\" prefix: " + value);
          continue;
        }
        if (this.shared.containsKey(value)) {
          file = this.shared.get(value);
          file.deltaOk = true;
          clientVersion = version;
          // Remove any elements from the edit stack with low version numbers
          // which have been acked by the server.
          Iterator<Object[]> pairPointer = file.editStack.iterator();
          while (pairPointer.hasNext()) {
            Object[] pair = pairPointer.next();
            if ((Integer) pair[0] <= clientVersion) {
              pairPointer.remove();
            }
          }

        } else {
          // This file does not map to a currently shared object.
          file = null;
          this.logger.log(Level.SEVERE, "Unknown file: " + value);
        }
      } else if (name == 'R' || name == 'r') {
        // The server reports it was unable to integrate the previous delta.
        if (file != null) {
          try {
            file.shadowText = URLDecoder.decode(value, "UTF-8");
          } catch (UnsupportedEncodingException e) {
            // Not likely on modern system.
            throw new Error("This system does not support UTF-8.", e);
          } catch (IllegalArgumentException e) {
            // Malformed URI sequence.
            throw new IllegalArgumentException(
                "Illegal escape in diff_fromDelta: " + value, e);
          }
          file.clientVersion = clientVersion;
          file.serverVersion = version;
          file.editStack.clear();
          if (name == 'R') {
            // Accept the server's raw text dump and wipe out any user's changes.
            try {
              file.setClientText(file.shadowText);
            } catch (Exception e) {
              // Potential call to untrusted 3rd party code.
              this.logger.log(Level.SEVERE, "Error calling setClientText on '"
                                            + file.file + "'", e);
            }
          }
          // Server-side activity.
          this.serverChange_ = true;
        }
      } else if (name == 'D' || name == 'd') {
        // The server offers a compressed delta of changes to be applied.
        if (file != null) {
          if (clientVersion != file.clientVersion) {
            // Can't apply a delta on a mismatched shadow version.
            file.deltaOk = false;
            this.logger.log(Level.SEVERE, "Client version number mismatch.\n" +
                "Expected: " + file.clientVersion + " Got: " + clientVersion);
          } else if (version > file.serverVersion) {
            // Server has a version in the future?
            file.deltaOk = false;
            this.logger.log(Level.SEVERE, "Server version in future.\n" +
                "Expected: " + file.serverVersion + " Got: " + version);
          } else if (version < file.serverVersion) {
            // We've already seen this diff.
            this.logger.log(Level.WARNING, "Server version in past.\n" +
                "Expected: " + file.serverVersion + " Got: " + version);
          } else {
            // Expand the delta into a diff using the client shadow.
            LinkedList<Diff> diffs;
            try {
              diffs = file.dmp.diff_fromDelta(file.shadowText, value);
              file.serverVersion++;
            } catch (IllegalArgumentException ex) {
              // The delta the server supplied does not fit on our copy of
              // shadowText.
              diffs = null;
              // Set deltaOk to false so that on the next sync we send
              // a complete dump to get back in sync.
              file.deltaOk = false;
              // Do the next sync soon because the user will lose any changes.
              this.syncInterval = 0;
              try {
                this.logger.log(Level.WARNING, "Delta mismatch.\n"
                    + URLEncoder.encode(file.shadowText, "UTF-8"));
              } catch (UnsupportedEncodingException e) {
                // Not likely on modern system.
                throw new Error("This system does not support UTF-8.", e);
              }
            }
            if (diffs != null && (diffs.size() != 1
                                  || diffs.getFirst().operation != Operation.EQUAL)) {
              // Compute and apply the patches.
              if (name == 'D') {
                // Overwrite text.
                file.shadowText = file.dmp.diff_text2(diffs);
                try {
                  file.setClientText(file.shadowText);
                } catch (Exception e) {
                  // Potential call to untrusted 3rd party code.
                  this.logger.log(Level.SEVERE, "Error calling setClientText on '"
                                                + file.file + "'", e);
                }
              } else {
                // Merge text.
                LinkedList<Patch> patches = file.dmp.patch_make(file.shadowText, diffs);
                // First shadowText.  Should be guaranteed to work.
                Object[] serverResult = file.dmp.patch_apply(patches, file.shadowText);
                file.shadowText = (String) serverResult[0];
                // Second the user's text.
                try {
                  file.patchClientText(patches);
                } catch (Exception e) {
                  // Potential call to untrusted 3rd party code.
                  this.logger.log(Level.SEVERE, "Error calling patchClientText on '"
                                                + file.file + "'", e);
                  e.printStackTrace();
                }
              }
              // Server-side activity.
              this.serverChange_ = true;
            }
          }
        }
      }
    }
  }


  /**
   * Compute how long to wait until next synchronization.
   */
  protected void computeSyncInterval_() {
    int range = this.maxSyncInterval - this.minSyncInterval;
    if (this.clientChange_) {
      // Client-side activity.
      // Cut the sync interval by 40% of the min-max range.
      this.syncInterval -= range * 0.4;
    }
    if (this.serverChange_) {
      // Server-side activity.
      // Cut the sync interval by 20% of the min-max range.
      this.syncInterval -= range * 0.2;
    }
    if (!this.clientChange_ && !this.serverChange_) {
      // No activity.
      // Let the sync interval creep up by 10% of the min-max range.
      this.syncInterval += range * 0.1;
    }
    // Keep the sync interval constrained between min and max.
    this.syncInterval =
        Math.max(this.minSyncInterval, this.syncInterval);
    this.syncInterval =
        Math.min(this.maxSyncInterval, this.syncInterval);
  }


  /**
   * Start sharing the specified object(s).
   * @param shareObjs Object(s) to start sharing.
   */
  public void share(ShareObj ... shareObjs) {
    for (ShareObj shareObj : shareObjs) {
      shareObj.mobwrite = this;
      this.shared.put(shareObj.file, shareObj);
      this.logger.log(Level.INFO, "Sharing shareObj: \"" + shareObj.file + "\"");
    }

    if (this.syncThread == null || !this.syncThread.isAlive()) {
      this.syncThread = new SyncThread(this);
      try {
        this.syncThread.start();
      } catch (IllegalThreadStateException e) {
        // Thread already started.
      }
    }
  }


  /**
   * Stop sharing the specified object(s).
   * @param shareObjs Object(s) to stop sharing.
   */
  public void unshare(ShareObj ... shareObjs) {
    for (ShareObj shareObj : shareObjs) {
      if (this.shared.remove(shareObj.file) == null) {
        this.logger.log(Level.INFO, "Ignoring \"" + shareObj.file + "\". Not currently shared.");
      } else {
        shareObj.mobwrite = null;
        this.logger.log(Level.INFO, "Unshared: \"" + shareObj.file + "\"");
      }
    }
  }


  /**
   * Stop sharing the specified file ID(s).
   * @param shareFiles ID(s) to stop sharing.
   */
  public void unshare(String ... shareFiles) {
    for (String shareFile : shareFiles) {
      ShareObj shareObj = this.shared.remove(shareFiles);
      if (shareObj == null) {
        this.logger.log(Level.INFO, "Ignoring \"" + shareFile + "\". Not currently shared.");
      } else {
        shareObj.mobwrite = null;
        this.logger.log(Level.INFO, "Unshared: \"" + shareObj.file + "\"");
      }
    }
  }


  /**
   * Unescape selected chars for compatibility with JavaScript's encodeURI.
   * In speed critical applications this could be dropped since the
   * receiving application will certainly decode these fine.
   * Note that this function is case-sensitive.  Thus "%3f" would not be
   * unescaped.  But this is ok because it is only called with the output of
   * URLEncoder.encode which returns uppercase hex.
   *
   * Example: "%3F" -> "?", "%24" -> "$", etc.
   *
   * @param str The string to escape.
   * @return The escaped string.
   */
  protected static String unescapeForEncodeUriCompatability(String str) {
    return str.replace("%21", "!").replace("%7E", "~")
        .replace("%27", "'").replace("%28", "(").replace("%29", ")")
        .replace("%3B", ";").replace("%2F", "/").replace("%3F", "?")
        .replace("%3A", ":").replace("%40", "@").replace("%26", "&")
        .replace("%3D", "=").replace("%2B", "+").replace("%24", "$")
        .replace("%2C", ",").replace("%23", "#");
  }

  private class SyncThread extends Thread {

    private MobWriteClient client;

    public SyncThread(MobWriteClient client) {
      super();
      this.client = client;
    }

    /**
     * Main execution loop for MobWrite synchronization.
     */
    public void run() {
      while(!this.client.shared.isEmpty()) {
        this.client.syncRun1_();

        this.client.computeSyncInterval_();

        try {
          Thread.sleep(this.client.syncInterval);
        } catch (InterruptedException e) {
          return;
        }
      }
      this.client.logger.log(Level.INFO, "MobWrite task stopped.");
    }
  }
}
