package com.google.mobwrite;

import java.awt.Font;
import javax.swing.JApplet;
import javax.swing.JLabel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.SpringLayout;
import javax.swing.SwingUtilities;

public class DemoEditorApplet extends JApplet {
  private JTextField demo_editor_title;
  private JTextArea demo_editor_text;

  @Override
  public void init() {
    //Execute a job on the event-dispatching thread:
    //creating this applet's GUI.
    try {
      SwingUtilities.invokeAndWait(new Runnable() {
        public void run() {
          createGUI();

          MobWriteClient mobwrite = new MobWriteClient();

          mobwrite.syncGateway = getParameter("syncGateway");
          if (mobwrite.syncGateway == null) {
            mobwrite.syncGateway = "http://mobwrite3.appspot.com/scripts/q.py";
          }
          try {
            mobwrite.maxSyncInterval = Integer.parseInt(getParameter("maxSyncInterval"));
          } catch (Exception e) {
            // Ignore, use default.
          }
          try {
            mobwrite.minSyncInterval = Integer.parseInt(getParameter("minSyncInterval"));
          } catch (Exception e) {
            // Ignore, use default.
          }

          ShareObj shareTitle = new ShareJTextComponent(demo_editor_title, "demo_editor_title");
          ShareObj shareText = new ShareJTextComponent(demo_editor_text, "demo_editor_text");
          mobwrite.share(shareTitle, shareText);
        }
      });
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  private void createGUI() {
    SpringLayout springLayout = new SpringLayout();
    getContentPane().setLayout(springLayout);

    JLabel label = new JLabel("MobWrite as a Collaborative Editor");
    label.setFont(new Font("SansSerif", Font.PLAIN, 18));
    springLayout.putConstraint(SpringLayout.NORTH, label, 10, SpringLayout.NORTH, getContentPane());
    springLayout.putConstraint(SpringLayout.WEST, label, 10, SpringLayout.WEST, getContentPane());
    springLayout.putConstraint(SpringLayout.EAST, label, -10, SpringLayout.EAST, getContentPane());
    getContentPane().add(label);

    demo_editor_title = new JTextField();
    springLayout.putConstraint(SpringLayout.NORTH, demo_editor_title, 6, SpringLayout.SOUTH, label);
    springLayout.putConstraint(SpringLayout.WEST, demo_editor_title, 10, SpringLayout.WEST, getContentPane());
    springLayout.putConstraint(SpringLayout.EAST, demo_editor_title, -10, SpringLayout.EAST, getContentPane());
    getContentPane().add(demo_editor_title);

    JScrollPane scrollPane = new JScrollPane();
    springLayout.putConstraint(SpringLayout.NORTH, scrollPane, 6, SpringLayout.SOUTH, demo_editor_title);
    springLayout.putConstraint(SpringLayout.WEST, scrollPane, 10, SpringLayout.WEST, getContentPane());
    springLayout.putConstraint(SpringLayout.EAST, scrollPane, -10, SpringLayout.EAST, getContentPane());
    springLayout.putConstraint(SpringLayout.SOUTH, scrollPane, -10, SpringLayout.SOUTH, getContentPane());
    getContentPane().add(scrollPane);

    demo_editor_text = new JTextArea();
    demo_editor_text.setLineWrap(true);
    demo_editor_text.setWrapStyleWord(true);
    scrollPane.setViewportView(demo_editor_text);
  }
}
