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

import java.awt.Color;
import java.awt.Container;
import java.awt.Font;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

import javax.swing.ButtonGroup;
import javax.swing.JApplet;
import javax.swing.JCheckBox;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPasswordField;
import javax.swing.JRadioButton;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import javax.swing.border.LineBorder;

public class DemoFormApplet extends JApplet implements ActionListener {
  private JTextField demo_form_what;
  private JTextField demo_form_date1;
  private JTextField demo_form_date2;
  private JLabel lblTo;
  private JCheckBox demo_form_all_day;
  private ButtonGroup demo_form_where;
  private JList demo_form_who;
  private JTextField demo_form_hidden;
  private JPasswordField demo_form_password;
  private JTextArea demo_form_description;

  @Override
  public void init() {
    //Execute a job on the event-dispatching thread:
    //creating this applet's GUI.
    try {
      SwingUtilities.invokeAndWait(new Runnable() {
        public void run() {
          createGUI();

          String syncGateway = getParameter("syncGateway");
          if (syncGateway == null) {
            syncGateway = "http://mobwrite3.appspot.com/scripts/q.py";
          }

          MobWriteClient mobwrite = new MobWriteClient(syncGateway);

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

          ShareObj shareWhat = new ShareJTextComponent(demo_form_what, "demo_form_what");
          ShareObj shareDate1 = new ShareJTextComponent(demo_form_date1, "demo_form_date1");
          ShareObj shareDate2 = new ShareJTextComponent(demo_form_date2, "demo_form_date2");
          ShareObj shareCheck = new ShareAbstractButton(demo_form_all_day, "demo_form_all_day");
          ShareObj shareRadio = new ShareButtonGroup(demo_form_where, "demo_form_where1");
          ShareObj shareSelect = new ShareJList(demo_form_who, "demo_form_who");
          ShareObj shareHidden = new ShareJTextComponent(demo_form_hidden, "demo_form_hidden");
          ShareObj sharePassword = new ShareJTextComponent(demo_form_password, "demo_form_password");
          ShareObj shareDescription = new ShareJTextComponent(demo_form_description, "demo_form_description");
          mobwrite.share(shareWhat, shareDate1, shareDate2, shareCheck,
              shareRadio, shareSelect, shareHidden, sharePassword, shareDescription);
        }
      });
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  /**
   * Lay out the GUI and initialize the form elements.
   */
  private void createGUI() {
    Container contentPane = this.getContentPane();
    contentPane.setLayout(null);
    int margin = 10;
    Font headerFont = new Font("SansSerif", Font.BOLD, 12);
    int headerWidth = 75;

    // Title
    JLabel label = new JLabel("MobWrite as a Collaborative Form");
    label.setFont(new Font("SansSerif", Font.PLAIN, 18));
    label.setBounds(margin, margin, 300, 26);
    contentPane.add(label);

    // What
    label = new JLabel("What");
    label.setFont(headerFont);
    label.setBounds(margin, 48, headerWidth, 14);
    contentPane.add(label);

    demo_form_what = new JTextField();
    demo_form_what.setBounds(headerWidth + margin, 48, 183, 20);
    contentPane.add(demo_form_what);

    // When
    label = new JLabel("When");
    label.setFont(headerFont);
    label.setBounds(margin, 73, headerWidth, 14);
    contentPane.add(label);

    demo_form_date1 = new JTextField();
    demo_form_date1.setBounds(headerWidth + margin, 70, 60, 20);
    contentPane.add(demo_form_date1);

    lblTo = new JLabel("to");
    lblTo.setBounds(148, 73, 18, 14);
    contentPane.add(lblTo);

    demo_form_date2 = new JTextField();
    demo_form_date2.setBounds(163, 70, 60, 20);
    contentPane.add(demo_form_date2);

    demo_form_all_day = new JCheckBox("All day");
    demo_form_all_day.setBounds(229, 69, 75, 23);
    demo_form_all_day.setActionCommand("All day");
    demo_form_all_day.setName("on");
    demo_form_all_day.addActionListener(this);
    contentPane.add(demo_form_all_day);

    // Where
    label = new JLabel("Where");
    label.setFont(headerFont);
    label.setBounds(margin, 98, headerWidth, 14);
    contentPane.add(label);

    demo_form_where = new ButtonGroup();
    JRadioButton rdbtnSanFrancisco = new JRadioButton("San Francisco");
    rdbtnSanFrancisco.setName("SFO");
    rdbtnSanFrancisco.setBounds(headerWidth + margin, 97, 109, 23);
    demo_form_where.add(rdbtnSanFrancisco);
    contentPane.add(rdbtnSanFrancisco);
    JRadioButton rdbtnNewYork = new JRadioButton("New York");
    rdbtnNewYork.setName("NYC");
    rdbtnNewYork.setBounds(headerWidth + margin, 118, 109, 23);
    demo_form_where.add(rdbtnNewYork);
    contentPane.add(rdbtnNewYork);
    JRadioButton rdbtnToronto = new JRadioButton("Toronto");
    rdbtnToronto.setName("YYZ");
    rdbtnToronto.setBounds(headerWidth + margin, 139, 109, 23);
    demo_form_where.add(rdbtnToronto);
    contentPane.add(rdbtnToronto);

    // Who
    label = new JLabel("Who");
    label.setFont(headerFont);
    label.setBounds(margin, 170, headerWidth, 14);
    contentPane.add(label);

    String[] data = {"Alice", "Bob", "Eve"};
    demo_form_who = new JList(data);
    demo_form_who.setBorder(new LineBorder(Color.BLACK));
    demo_form_who.setBounds(headerWidth + margin, 169, 87, 65);
    contentPane.add(demo_form_who);

    // Hidden
    label = new JLabel("Hidden");
    label.setFont(headerFont);
    label.setBounds(margin, 247, headerWidth, 14);
    contentPane.add(label);

    demo_form_hidden = new JTextField();
    demo_form_hidden.setBounds(headerWidth + margin, 244, 87, 20);
    demo_form_hidden.setVisible(false);
    contentPane.add(demo_form_hidden);

    // Password
    label = new JLabel("Password");
    label.setFont(headerFont);
    label.setBounds(margin, 275, headerWidth, 14);
    contentPane.add(label);

    demo_form_password = new JPasswordField();
    demo_form_password.setBounds(headerWidth + margin, 273, 87, 20);
    contentPane.add(demo_form_password);

    // Description
    label = new JLabel("Description");
    label.setFont(headerFont);
    label.setBounds(margin, 300, headerWidth, 14);
    contentPane.add(label);

    demo_form_description = new JTextArea();
    demo_form_description.setLineWrap(true);
    demo_form_description.setWrapStyleWord(true);
    JScrollPane scrollPane = new JScrollPane(demo_form_description);
    scrollPane.setBounds(headerWidth + margin, 297, 210, 74);
    contentPane.add(scrollPane);
  }

  /**
   * When the 'All day' checkbox is ticked, the end time disappears.
   * @param e Action event.
   */
  public void actionPerformed(ActionEvent e) {
    if ("All day".equals(e.getActionCommand())) {
      boolean allDay = demo_form_all_day.isSelected();
      lblTo.setVisible(!allDay);
      demo_form_date2.setVisible(!allDay);
      demo_form_all_day.setLocation(allDay ? 148 : 229, demo_form_all_day.getLocation().y);
    }
  }
}
