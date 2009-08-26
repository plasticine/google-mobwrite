package name.fraser.neil.mobwrite;

import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.Enumeration;

import javax.swing.AbstractButton;
import javax.swing.ButtonGroup;

class ShareButtonGroup extends ShareObj {

  /**
   * The user-facing radio button group to be shared.
   */
  private ButtonGroup buttonGroup;

  /**
   * Constructor of shared object representing a radio button.
   * @param bg Radio button group to share.
   * @param file Filename to share as.
   */
public ShareButtonGroup(ButtonGroup bg, String file) {
    super(file);
    this.buttonGroup = bg;
    this.mergeChanges = false;
  }

  /**
   * Retrieve the user's check.
   * @return Plaintext content.
   */
  public String getClientText() {
    Enumeration<AbstractButton> elements = this.buttonGroup.getElements();
    while (elements.hasMoreElements()) {
      AbstractButton ab = elements.nextElement();
      if (ab.isSelected()) {
        return ab.getName();
      }
    }
    return "";
  }

  /**
   * Set the user's check.
   * @param text New content.
   */
  public void setClientText(String text) {
    Enumeration<AbstractButton> elements = this.buttonGroup.getElements();
    while (elements.hasMoreElements()) {
      AbstractButton ab = elements.nextElement();
      if (text.equals(ab.getName())) {
        ab.setSelected(true);
        // Fire any events.
        String actionCommand = ab.getActionCommand();
        ActionEvent e = new ActionEvent(ab, ActionEvent.ACTION_PERFORMED, actionCommand, 0);
        for (ActionListener listener : ab.getActionListeners()) {
          listener.actionPerformed(e);
        }
      }
    }
  }

}
