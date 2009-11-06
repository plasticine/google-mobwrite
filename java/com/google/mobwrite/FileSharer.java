/**
 * FileSharer - Sharing a document via MobWrite
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
import java.io.BufferedWriter;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.logging.Level;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


public class FileSharer {

  /**
   * @author fraser
   *
   */
  private class MobWriteSingleExec extends MobWriteClient {

    /**
     * Share the specified object(s) for one cycle.
     */
    public void share(ShareObj ... shareObjs) {
      for (int i = 0; i < shareObjs.length; i++) {
        ShareObj shareObj = shareObjs[i];
        shareObj.mobwrite = this;
        this.shared.put(shareObj.file, shareObj);
        this.logger.log(Level.INFO, "Sharing shareObj: \"" + shareObj.file + "\"");
      }

      syncRun1_();

      for (int i = 0; i < shareObjs.length; i++) {
        ShareObj shareObj = this.shared.remove(shareObjs[i].file);
        if (shareObj != null) {
          shareObj.mobwrite = null;
          this.logger.log(Level.INFO, "Unshared: \"" + shareObj.file + "\"");
        }
      }
    }
  }

  private class ShareFile extends ShareObj {

    /**
     * The name of the file on disk to be shared.
     */
    private String filename;

    /**
     * Constructor of shared object representing a file.
     * @param filename Filename of file on disk.
     * @param docname Document name to share as.
     */
    public ShareFile(String filename, String docname) {
      super(docname);
      this.filename = filename;
    }

    /**
     * Retrieve the file contents.
     * @return Plaintext content.
     */
    public String getClientText() {
      StringBuilder sb = new StringBuilder();
      BufferedReader input;
      try {
        input = new BufferedReader(new FileReader(filename));

        try {
          String line;
          while ((line = input.readLine()) != null) {
            sb.append(line);
          }
        }
        finally {
          input.close();
        }
      } catch (IOException ex) {
        ex.printStackTrace();
        return null;
      }
      return sb.toString();
    }

    /**
     * Set the file contents.
     * @param text New content.
     */
    @Override
    public void setClientText(String text) {
      try {
        BufferedWriter output = new BufferedWriter(new FileWriter(filename));

        try {
          output.write(text);
        } finally {
          output.close();
        }
      } catch (IOException ex) {
        ex.printStackTrace();
      }
    }
  }


  /**
   * Instance of MobWrite.
   */ 
  private MobWriteSingleExec mobwrite;

  /**
   * Instance of ShareFile, a ShareObj.
   */ 
  private ShareFile shareFile;

  /**
   * Constructor for FileSharer.
   * Creates a MobWrite client.
   */
  public FileSharer() {
    mobwrite = new MobWriteSingleExec();
  }

  /**
   * Save MobWrite's current state to disk.
   */
  private void saveConfig(String tmpfile) {
    try {
      BufferedWriter output = new BufferedWriter(new FileWriter(tmpfile));

      try {
        writeOneConfigLine(output, Fields.SyncGateway, this.mobwrite.syncGateway);
        writeOneConfigLine(output, Fields.SyncUsername, this.mobwrite.syncUsername);
        writeOneConfigLine(output, Fields.Filename, this.shareFile.filename);
        writeOneConfigLine(output, Fields.ID, this.shareFile.file);
        StringBuilder sb = new StringBuilder();
        for (Object[] pair : this.shareFile.editStack) {
          sb.append(String.valueOf(pair[0])).append('\n');
          sb.append((String) pair[1]).append('\n');
        }
        writeOneConfigLine(output, Fields.EditStack, sb.toString());
        writeOneConfigLine(output, Fields.ShadowText, this.shareFile.shadowText);
        writeOneConfigLine(output, Fields.ClientVersion, Integer.toString(this.shareFile.clientVersion));
        writeOneConfigLine(output, Fields.ServerVersion, Integer.toString(this.shareFile.serverVersion));
        writeOneConfigLine(output, Fields.DeltaOk, Boolean.toString(this.shareFile.deltaOk));
        writeOneConfigLine(output, Fields.MergeChanges, Boolean.toString(this.shareFile.mergeChanges));
      } finally {
        output.close();
      }
    } catch (IOException ex) {
      ex.printStackTrace();
    }
  }

  /**
   * Write one "name = value" line, properly encoded.
   * @param output The output writer.
   * @param name Name of tuple.
   * @param value Value of tuple.
   * @throws IOException
   */
  private void writeOneConfigLine(BufferedWriter output, Fields field,
      String value) throws IOException {
    String name = URLEncoder.encode(field.toString(), "UTF-8");
    value = URLEncoder.encode(value, "UTF-8");
    output.write(name + " = " + value + "\n");
  }

  /**
   * Load MobWrite's current state from disk.
   */
  private void loadConfig(String tmpfile) {
    HashMap<String, String> dict = new HashMap<String, String>();
    try {
      BufferedReader input = new BufferedReader(new FileReader(tmpfile));

      try {
        String line;
        Pattern lineRegex = Pattern.compile("^(\\w+)\\s*=\\s*(.+)$");
        while ((line = input.readLine()) != null) {
          line = line.trim();
          // Comment lines start with a ;
          if (!line.startsWith(";")) {
            Matcher m = lineRegex.matcher(line);
            if (m.matches()) {
              String name = m.group(1);
              String value = m.group(2);
              name = URLDecoder.decode(name, "UTF-8");
              value = URLDecoder.decode(value, "UTF-8");
              dict.put(name, value);
            }
          }
        }
      }
      finally {
        input.close();
      }
    } catch (FileNotFoundException ex){
      // No config to load.
    } catch (IOException ex){
      ex.printStackTrace();
    }

    // Set each of the configuration parameters.
    String value;
    value = dict.get(Fields.SyncGateway.toString());
    if (value != null) {
      this.mobwrite.syncGateway = value;
    }
    value = dict.get(Fields.SyncUsername.toString());
    if (value != null) {
      this.mobwrite.syncUsername = value;
    }

    String id = dict.get(Fields.ID.toString());
    String filename = dict.get(Fields.Filename.toString());
    if (id != null && filename != null) {
      this.shareFile = new ShareFile(filename, id);
      value = dict.get(Fields.EditStack.toString());
      if (value != null) {
        // Decode the edit stack.
        this.shareFile.editStack.clear();
        String[] lines = value.split("\n");
        Integer version = null;
        for (String line : lines) {
          // Even lines are version numbers, odd lines are action strings.
          if (version == null) {
            version = Integer.getInteger(line);
          } else {
            this.shareFile.editStack.push(new Object[]{version, line});
            version = null;
          }
        }
      }
      value = dict.get(Fields.ShadowText.toString());
      if (value != null) {
        this.shareFile.shadowText = value;
      }
      value = dict.get(Fields.ClientVersion.toString());
      if (value != null) {
        this.shareFile.clientVersion = Integer.valueOf(value);
      }
      value = dict.get(Fields.ServerVersion.toString());
      if (value != null) {
        this.shareFile.serverVersion = Integer.valueOf(value);
      }
      value = dict.get(Fields.DeltaOk.toString());
      if (value != null) {
        this.shareFile.deltaOk = Boolean.parseBoolean(value);
      }
      value = dict.get(Fields.MergeChanges.toString());
      if (value != null) {
        this.shareFile.mergeChanges = Boolean.parseBoolean(value);
      }
    }
  }

  private enum Fields {
    SyncGateway, SyncUsername, Filename, ID, EditStack, ShadowText,
    ClientVersion, ServerVersion, DeltaOk, MergeChanges
  }
  
  /**
   * Usage: FileSharer <syncgateway> <docname> <filename>
   * @param args Command line arguments.
   */
  public static void main(String[] args) {
    if (args.length != 3) {
      System.err.println("Usage: FileSharer <syncgateway> <docname> <filename>");
      return;
    }
    String syncgateway = args[0];
    String docname = args[1];
    String filename = args[2];
    String configname = filename + "." + docname + ".mobwrite";

    FileSharer sharer = new FileSharer();
    sharer.mobwrite.syncGateway = syncgateway;

    sharer.loadConfig(configname);
    if (sharer.shareFile == null || !args[1].equals(sharer.shareFile.file)) {
      // Provided ID is different from the one we loaded (or none was loaded).
      sharer.shareFile = sharer.new ShareFile(filename, docname);
    }

    // Add the ShareFile to MobWrite and sync once.
    sharer.mobwrite.share(sharer.shareFile);

    sharer.saveConfig(configname);    
  }

}
