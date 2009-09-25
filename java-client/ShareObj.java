package name.fraser.neil.mobwrite;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.LinkedList;
import java.util.logging.Level;
import java.util.regex.Pattern;
import name.fraser.neil.plaintext.diff_match_patch;
import name.fraser.neil.plaintext.diff_match_patch.*;

public abstract class ShareObj {
  /**
   * Instantiation of the Diff Match Patch library.
   * http://code.google.com/p/google-diff-match-patch/
   */
  protected diff_match_patch dmp;

  /**
   * The filename or ID for this shared object.
   */
  protected String file;

  public String getFile() {
    return file;
  }

  /**
   * The hosting MobWriteClient.
   */
  protected MobWriteClient mobwrite;

  public MobWriteClient getMobwrite() {
    return mobwrite;
  }

  /**
   * List of currently unacknowledged edits sent to the server.
   */
  protected LinkedList<Object[]> editStack;

  /**
   * Client's understanding of what the server's text looks like.
   */
  protected String shadowText = "";

  /**
   * The client's version for the shadow (n).
   */
  protected int clientVersion = 0;

  /**
   * The server's version for the shadow (m).
   */
  protected int serverVersion = 0;

  /**
   * Did the client understand the server's delta in the previous heartbeat?
   * Initialize false because the server and client are out of sync initially.
   */
  protected boolean deltaOk = false;

  /**
   * Synchronization mode.
   * True: Used for text, attempts to gently merge differences together.
   * False: Used for numbers, overwrites conflicts, last save wins.
   */
  protected boolean mergeChanges = true;

  /**
   * A file ID must start with a letter and continue with letters, numbers,
   * dashes, periods, colons or underscores.  From the W3 spec for HTML IDs.
   */
   private static Pattern idPattern = Pattern.compile("^[A-Za-z][-.:\\w]*$");

  /**
   * Constructor.  Create a ShareObj with a file ID.
   * @param file Filename to share as.
   * @throws IllegalArgumentException If filename is illegal.
   */
  public ShareObj(String file) {
    if (!idPattern.matcher(file).matches()) {
      throw new IllegalArgumentException("Illegal id " + file);
    }
    this.file = file;
    this.dmp = new diff_match_patch();
    this.dmp.Diff_Timeout = 0.5f;
    // List of unacknowledged edits sent to the server.
    this.editStack = new LinkedList<Object[]>();
  }

  /**
   * Fetch or compute a plaintext representation of the user's text.
   * @return Plaintext content.
   */
  public abstract String getClientText();

  /**
   * Set the user's text based on the provided plaintext.
   * @param text New text.
   */
  public abstract void setClientText(String text);

  /**
   * Modify the user's plaintext by applying a series of patches against it.
   * @param patches Array of Patch objects.
   */
  public void patchClientText(LinkedList<Patch> patches) {
    String oldClientText = this.getClientText();
    Object[] result = this.dmp.patch_apply(patches, oldClientText);
    // Set the new text only if there is a change to be made.
    if (!oldClientText.equals(result[0])) {
      // The following will probably destroy any cursor or selection.
      // Widgets with cursors should override and patch more delicately.
      this.setClientText((String) result[0]);
    }
  }

  /**
   * Notification of when a diff was sent to the server.
   * @param diffs Array of diff objects.
   */
  private void onSentDiff(LinkedList<Diff> diffs) {
    // Potential hook for subclass
  }

  /**
   * Does the text look like unmergable content?
   * Currently we look for numbers.
   * @param text Plaintext content.
   * @return True iff unmergable.
   */
  protected boolean isEnum(String text) {
    Pattern p = Pattern.compile("^\\s*-?[\\d.,]+\\s*$");
    return !p.matcher(text).matches();
  }

  /**
   * Return the command to nullify this field.  Also unshares this field.
   * @return Command to be sent to the server.
   */
  protected String nullify() {
    mobwrite.unshare(this);
    // Create the output starting with the file statement, followed by the edits.
    String data = mobwrite.idPrefix + this.file;
    return "N:" + data + '\n';
  }

  /**
   * Asks the ShareObj to synchronize.  Computes client-made changes since
   * previous postback.  Return '' to skip this synchronization.
   * @return Commands to be sent to the server.
   */
  protected String syncText() {
    String clientText;
    try {
      clientText = this.getClientText();
      if (clientText == null) {
        // Null is not an acceptable result.
        throw new NullPointerException();
      }
    } catch (Exception e) {
      // Potential call to untrusted 3rd party code.
      this.mobwrite.logger.log(Level.SEVERE, "Error calling getClientText on '" + this.file + "': " + e);
      e.printStackTrace();
      return "";
    }
    if (this.deltaOk) {
      // The last delta postback from the server to this shareObj was successful.
      // Send a compressed delta.
      LinkedList<Diff> diffs = this.dmp.diff_main(this.shadowText, clientText, true);
      if (diffs.size() > 2) {
        this.dmp.diff_cleanupSemantic(diffs);
        this.dmp.diff_cleanupEfficiency(diffs);
      }
      boolean changed = diffs.size() != 1
          || diffs.getFirst().operation != Operation.EQUAL;
      if (changed) {
        this.mobwrite.clientChange_ = true;
        this.shadowText = clientText;
      }
      // Don't bother appending a no-change diff onto the stack if the stack
      // already contains something.
      if (changed || this.editStack.isEmpty()) {
        String action = (this.mergeChanges ? "d:" : "D:") + this.clientVersion
            + ':' + this.dmp.diff_toDelta(diffs);
        this.editStack.push(new Object[]{this.clientVersion, action});
        this.clientVersion++;
        try {
          this.onSentDiff(diffs);
        } catch (Exception e) {
          // Potential call to untrusted 3rd party code.
          this.mobwrite.logger.log(Level.SEVERE, "Error calling onSentDiff on '" + this.file + "': " + e);
          e.printStackTrace();
        }
      }
    } else {
      // The last delta postback from the server to this shareObj didn't match.
      // Send a full text dump to get back in sync. This will result in any
      // changes since the last postback being wiped out. :(
      String data = clientText;
      try {
        data = URLEncoder.encode(data, "UTF-8").replace('+', ' ');
      } catch (UnsupportedEncodingException e) {
        // Not likely on modern system.
        throw new Error("This system does not support UTF-8.", e);
      }
      data = MobWriteClient.unescapeForEncodeUriCompatability(data);
      if (this.shadowText != clientText) {
        this.shadowText = clientText;
      }
      this.clientVersion++;
      String action = "r:" + this.clientVersion + ':' + data;
      // Append the action to the edit stack.
      this.editStack.push(new Object[]{this.clientVersion, action});
    }

    // Create the output starting with the file statement, followed by the edits.
    String data = mobwrite.idPrefix + this.file;
    data = "F:" + this.serverVersion + ':' + data + '\n';
    for (Object[] pair : this.editStack) {
      data += (String) pair[1] + '\n';
    }
    return data;
  }

  /**
   * Stop sharing this object.
   */
  public void unshare() {
    if (this.mobwrite != null) {
      this.mobwrite.unshare(this);
    }
  }
}
