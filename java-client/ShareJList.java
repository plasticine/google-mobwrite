package name.fraser.neil.mobwrite;

import java.util.Vector;

import javax.swing.JList;
import javax.swing.ListModel;
import javax.swing.ListSelectionModel;

class ShareJList extends ShareObj {

  /**
   * The user-facing list component to be shared.
   */
  private JList jList;

  /**
   * Constructor of shared object representing a select box.
   * @param jl List component to share.
   * @param file Filename to share as.
   */
  public ShareJList(JList jl, String file) {
    super(file);
    this.jList = jl;
    this.mergeChanges = jl.getSelectionMode() != ListSelectionModel.SINGLE_SELECTION;
  }

  /**
   * Retrieve the user's selection(s).
   * @return Plaintext content.
   */
  public String getClientText() {
    StringBuilder sb = new StringBuilder();
    Object[] selected = this.jList.getSelectedValues();
    boolean empty = true;
    for (Object item : selected) {
      if (!empty) {
        sb.append('\0');
      }
      sb.append(item);
      empty = false;
    }
    return sb.toString();
  }

  /**
   * Set the user's selection(s).
   * @param text New content.
   */
  public void setClientText(String text) {
    text = '\0' + text + '\0';
    ListModel list = this.jList.getModel();
    Vector<Integer> selectedVector = new Vector<Integer>();
    for (int i = 0; i < list.getSize(); i++) {
      if (text.indexOf(list.getElementAt(i).toString()) != -1) {
        selectedVector.add(i);
      }
    }
    int[] selectedArray = new int[selectedVector.size()];
    int i = 0;
    for (int selected : selectedVector) {
      selectedArray[i] = selected;
      i++;
    }
    this.jList.setSelectedIndices(selectedArray);
  }

}
