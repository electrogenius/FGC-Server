/* global $ */
/* global location */
/* global io */


// Whenever we load a new keyboard we save the id so we can return to it if 'Back'
// is pressed.
var lastKeyboard = [];

$(document).ready(function (){
    // Start a timer to keep our clock updated.
    setInterval (blinker, 1000);
    
    // Open the socketio connection.
    var socket = io.connect('http://' + document.domain + ':' + location.port);
    
    // We will keep the data for every zone we work on here.
    var allZonesData = {};
    
    // Data for the currently selected zone is held here.
    var zoneData;
    
    // Start with the main function keyboard.
    switchToKeyboard ("main_function_keyboard");

    /******************************************************************************* 
    * These are the socketio callbacks.
    * 
    * Comments: "messages" from the server are json objects. They have the basic
    * structure of {"command": "The command", "payload": "The payload"} where
    * "command" is a string specifying the purpose of the message and "payload" can
    * be anything. We do a switch on the command and can then process the payload
    * as required. Commands are as follows:
    * "zone_check_reply" - the payload is the data for a zone. It is received in
    * response to a "zone_data_check". We do a "zone_data_check" whenever we have
    * changed the timers for a zone so that we get the actual state of the zone
    * with the new timer values.
    * "zone_data_reply" - the payload is the data for a zone. It is received in
    * response to a "zone_data_request". We do a "zone_data_request" whenever we have
    * a zone to display that we have not previously displayed. Once we have received
    * the data for a zone we keep it in the global allZonesData.
    * "zone_states" - the payload is the state of every zone. It is received in
    * response to a "zone_state_request". We do a "zone_state_request" whenever we
    * want to update the zone keys with the current state of the zones. We indicate
    * on zones with a green background. If we perform some action that will change
    * the zone state (e.g. boost, suspend etc) we will flash the key background;
    * Green if it is going from off to on and red for on to off. Note: we do not
    * indicate an existing off zone with solid red, only on zones are indicated.
    * "console_message" - the payload can be anything. The server sends "console_message"
    * for debug purposes and we simply pass it on to the console.log function.
    ********************************************************************************/   

    // Called when socketio connects.
    socket.on('connect', function() {
        console.log ('Connected');
    });
    
    // Called when we get a socketio message from server.
    socket.on('message', function (msg) {
        // Commands from the server are json strings.
        // Convert received json message to object and run the command.
        var messageData = JSON.parse(msg);
        switch (messageData.command) {
            case "zone_check_reply":
            case "zone_data_reply":
                // The server has replied to a request for data for a zone.
                // Keep a copy in our current zoneData and also in all our
                // allZonesData. We keep in the latter so we do not have to
                // reload the data if we return to the zone. We use json parse
                // each time so that we have a deep copy and not just a reference.
                zoneData = JSON.parse(msg).payload;
                allZonesData [zoneData.zone] = JSON.parse(msg).payload;
                // If this is a data reply we will save the zone state so that if
                // an action changes the state we can indicate this to the user
                // by comparing the new state with the last state.
                if (messageData.command == "zone_data_reply") {
                    zoneData.last_zone_state = zoneData.zone_state;
                    allZonesData [zoneData.zone].last_zone_state = zoneData.zone_state;
                }
                console.log ("ZONEDATA", zoneData);
                displayZoneTimerInfo ();
                displayZoneStatus ();
                displayStates ();
                break;
            
            case "console_message":
                console.log ("MESSAGE", messageData.payload);
                break;

            case "zone_states":
                allZonesData = JSON.parse(msg).payload;
                displayStates ();

                break;
            }
    });
    
    /******************************************************************************* 
    * These are the heating zone and timer keyboard keys callbacks.
    * 
    * Comments: We have 20 keys on a 5x4 matrix. Each key is within a button holder
    * and these are numbered from 1-20, starting at top left. Within each button
    * holder we place the key that we require for a particular keyboard. We do this
    * either by replacing the entire keyboard or cloning individual keys into the
    * correct location. We assign each key or groups of keys different classes so
    * that when we get a key callback we can easily identify the key and call the
    * required function. Note that because we are cloning we can have duplicate id
    * values. This does not cause an issue as the working keyboard is defined in
    * html as the 1st keyboard and by using the "first" selector only the key on
    * the 1st keyboard will be accessed.
    ********************************************************************************/   
    
    // Is this a top level operation key?
    $("#keyboards").on('click', '.btn_operation', controlOperation);        
    // Is this a zone key? These key are labelled with room names.
    $("#keyboards").on('click', '.btn_zone', processZoneKeys);        
    // Is this a 'delete', confirm' or 'cancel' key for a delete operation?
    $("#keyboards").on('click', '.btn_delete', controlDelete); 
    // Is this a 'disable, 'enable', confirm' or 'cancel' key for a timer enable disable operation?
    $("#keyboards").on('click', '.btn_enable_disable', controlEnableOrDisable);
    // Is this 'suspend' or 'resume' key?
    $("#keyboards").on('click', '.btn_suspend_resume', controlSuspendOrResume);
    // Is this 'previous' or 'next' key?
    $("#keyboards").on('click', '.btn_previous_next', controlPreviousOrNext);
    // Is this one of the boost keys?
    $("#keyboards").on('click', '.btn_boost', controlBoost);
    // Is this a on at, off at, days key?
    $("#keyboards").on('click', '.btn_on_off_days', controlOnAtOffAtDays);
    // Is this the back key?
    $("#keyboards").on('click', '.btn_back', controlBack);
    // Is this the heating finished key?
    $("#keyboards").on('click', '.btn_heating_finished', controlHeatingFinished);
    // Is this the new key?
    $("#keyboards").on('click', '.btn_new', controlNew);
    // Is this the set timer key?
    $("#keyboards").on('click', '.btn_set_timer', controlSetTimer);
    // Is this the rads or ufh key?
    $("#keyboards").on('click', '.btn_rads_ufh', controlRadsUfh);
    // Is this an 'on at' time entry key?
    // These will be digits 0-9, plus the 'confirm' and 'cancel' keys.
    $("#keyboards").on('click', '.btn_on_at_entry', {field : "inputOnAtDigit"}, processProgrammingKeys);
    // Is this an 'off at' time entry key?
    // These will be digits 0-9, plus the 'confirm' and 'cancel' keys.
    $("#keyboards").on('click', '.btn_off_at_entry', {field : "inputOffAtDigit"}, processProgrammingKeys);
    // Is this a 'day' entry key?
    // These will be day keys, plus the 'confirm' and 'cancel' keys.
    $("#keyboards").on('click', '.btn_day_entry', {field : "inputDaysDay"}, processProgrammingKeys);    
    // If this is a basic digit key not being used? Keep button in same state.
    $("#keyboards").on('click', '.btn_digit', function (event) {
        $(this).addClass('btn_digit_clicked');
    });
    // Is this a control key not being used? Keep button in same state.
    $("#keyboards").on('click', '.btn_select', function (event) {
        $(this).addClass('btn_select_clicked');
    });

    /******************************************************************************* 
    * Function: controlOperation () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: The initial keyboard allows selection of the type of operation to
    * select (heating, alarm etc). Pressing a key brings us here.
    * 
    ********************************************************************************/   
    function controlOperation () {
        switch (this.id) {
            case "function_heating":
                // Start on rad select.
                switchToKeyboard ("rad_select_keyboard");
                // Clear any existing data.
                allZonesData = {};
                // Request the state of each zone from server so that we can indicate
                // which zones are on.
                socket.send (JSON.stringify ({"command":"zone_state_request"}));
                break;
        }    
    }

    /******************************************************************************* 
    * Function: controlRadsUfh () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: You can switch between rads or ufh zones and pressing the rad or ufh
    * keys brings us here.
    * 
    ********************************************************************************/   
    function controlRadsUfh () {

        // Display correct keyboard.
        if (this.id == "control_rads") {
            switchToKeyboard ("rad_select_keyboard");
        } else {
            switchToKeyboard ("ufh_select_keyboard");
        }
        // Show which zones are on.
        displayStates ();
    }

    /******************************************************************************* 
    * Function: controlBack () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Pressing the back key brings us here.
    * 
    ********************************************************************************/   
    function controlBack () {
        // Clear any warning messages and number of entries.
        $("#bottom_line_left").text ("");
        $("#display_entries").text ("");
        // We dump the last keyboard we kept and then 
        // get the previous keyboard to return to.
        // Only dump last entry if there are more than 1 entries.
        if (lastKeyboard.length > 1) {
            lastKeyboard.pop();
        }
        // Get the keyboard we want to return to and load it.
        var previousKeyboard = lastKeyboard.pop();
        switchToKeyboard (previousKeyboard);
        // If we're on a zone select we need to re-select the zone and
        // get the server to check the zone so that we get any
        // change in state that new timers may have caused.
        // Checking the zone does not cause the server to change
        // the actual zone hardware state. This will only happen
        // when we select "Finished".
        if ((previousKeyboard == "rad_zone_selected_keyboard")
            ||
            (previousKeyboard == "ufh_zone_selected_keyboard")) {
            $("#current_keyboard #" + zoneData.zone).addClass('btn_zone_clicked');
            // Do a zone check this will cause the server to send the zone
            // data to us which will then be re-displayed in the callback.
            socket.send (JSON.stringify ({"command":"zone_data_check", "payload":zoneData}));
        }
        displayStates ();
    }

    /******************************************************************************* 
    * Function: controlHeatingFinished () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments:  Pressing the finished key brings us here. When we have finished
    * programming timers and operations we send all the new data to the server.
    * 
    ********************************************************************************/   
    function controlHeatingFinished () {
        // Scan through all our zones.
        for (var zone in allZonesData) {
            // Has a zone been modified?
            if (allZonesData [zone]["update"] == "pending") {
                // Flag we sent it.
                allZonesData [zone]["update"] == "sent";
                // Send the server the new zone data.
                socket.send (JSON.stringify ({"command":"zone_update", "payload":allZonesData [zone]}));
            }
        }
        // We dump the last keyboard we kept and then 
        // get the previous keyboard to return to.
        // Only dump last entry if there are more than 1 entries.
        if (lastKeyboard.length > 1) {
            lastKeyboard.pop();
        }
        // Get the keyboard we want to return to and load it.
        switchToKeyboard (lastKeyboard.pop());
    }
    
    /******************************************************************************* 
    * Function: controlSetTimer () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Pressing the set timer key brings us here.
    * 
    ********************************************************************************/   
    function controlSetTimer () {
        switchToKeyboard ("timer_set_keyboard");
        // As this is a new zone we reset the selected index.
        zoneData.timer_selected = 1;
        // Display 1st timer entry.
        displayProgramEntry ();
        displayCurrentTimerInfo ();
    }

    /******************************************************************************* 
    * Function: controlNew () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Pressing the new key brings us here.
    * 
    ********************************************************************************/   
    function controlNew () {
        // Keep button in same state when clicked.
        $(this).addClass('btn_select_clicked');
        // Create and display  a new entry at the end of current entries.
        zoneData.timers.push ({"on_at":"00:00", "off_at":"00:00",
                                "days": "_______", "enabled":false});
        zoneData.timer_entries += 1;
        zoneData.timer_selected = zoneData.timer_entries;
        displayProgramEntry ();
        displayCurrentTimerInfo ();
        // Add the 'on at', 'off at', 'days' and 'delete' keys.
        replaceKey ("key4", "on_at_key");
        replaceKey ("key9", "off_at_key");
        replaceKey ("key14", "days_key");
        replaceKey ("key18", "delete_key");
    }

    /******************************************************************************* 
    * Function: controlSuspendOrResume () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: If a zone is on via a timer the suspend key will be active. Pressing
    * the key will bring us here. We then turn the zone off and change the key to
    * resume. Pressing the resume key will return us here and we will restore the
    * zone state.
    *
    ********************************************************************************/
    function controlSuspendOrResume () {
        if (this.id == "control_resume") {
            // We can only have been suspended if we were timed so put zone
            // back to timer.
            zoneData.mode = "timer";
            zoneData.zone_state = "on";
            // Change resume key to suspend key.
            replaceKey ("key15", "suspend_key");
        } else {
            // Suspend key can only be present in timer mode.
            // Set zone to suspended and off.
            zoneData.mode = "suspended";
            zoneData.zone_state = "off";
            // Change suspend key to resume key.
            replaceKey ("key15", "resume_key");
        }
        // Flag we have made a change and re-display current status.
        zoneData.update = "pending";
        allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
        displayZoneStatus ();
        displayStates ();
    }

    /******************************************************************************* 
    * Function: controlBoost () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Turns a zone on for an extra period of time. The boost key is alternate
    * action. 1st press is initial boost period, 2nd press doubles this, 3rd press
    * cancels boost. If a zone is selected that is already in boost the 1st press
    * will be cancel boost.
    * 
    * NB WE NEED TO MODIFY FOR UFH BOOST TIMES
    *
    ********************************************************************************/
    function controlBoost () {
        
        switch (this.id) {
            case "control_boost_1_hour":
                // If we are in 'timer' mode and the zone is on add boost to
                // the off time, othewise add to the current time.
                if ((zoneData.mode == "timer") && (zoneData.zone_state == "on")) {
                    zoneData.boost_off_time = getTime (1, zoneData.next_off_time);
                } else {
                    // Add boost to current time as we are in manual or suspended mode.
                    zoneData.boost_off_time = getTime (1, "current");
                }
                // Flag we are now in boost mode and show zone on. We prepend "boost_"
                // to the existing mode so that when boost ends we can revert to
                // whatever mode we were in by stripping the "boost_" off.
                zoneData.mode = "boost_" + zoneData.mode;
                zoneData.zone_state = "on";
                // Flag we have turned zone on and re-display current status.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                displayZoneStatus ();
                displayStates ();
                // Change boost key to 2 hours so user can press boost key
                // twice to get 2 hours. This must be after displayZoneStatus() as
                // displayZoneStatus() sets the boost key to boost off. 
                replaceKey ("key10", "boost_2_hours_key");
                break;

            case "control_boost_2_hours":
                // We are already in 'boost' mode so add another 1 hour boost to
                // the boost time.
                zoneData.boost_off_time = getTime (1, zoneData.boost_off_time);
                // Flag we have made a change and re-display current status.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                displayZoneStatus ();
                displayStates ();
                // We do not need to set boost off key here as displayZoneStatus will
                // set it to boost off.
                break;
                
            case "control_boost_off":
                // Put mode back to how it was before boost by removing "boost_" from
                // the mode string and show the zone is off (this may change below if
                // we were on a timer).
                zoneData.mode = zoneData.mode.slice(6);
                zoneData.zone_state = "off";
                // Flag we have made a change and update zone info.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                // We may have boosted a timer so we need to check if it is still active.
                // We will do a zone check this will cause the server to send the zone
                // data to us which will then be re-displayed in the callback.
                socket.send (JSON.stringify ({"command":"zone_data_check", "payload":zoneData}));
                // Note: We do not need to set boost key here as displayZoneStatus will
                // set it to boost 1 hour.
                break;             
        }
    }

    /******************************************************************************* 
    * Function: controlEnableOrDisable () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Enable or disable a timer entry. This allows us to set up multiple
    * timers and switch between them. This is useful for holiday periods when different
    * times may be required and avoids having to change a timer each time. Pressing
    * enable/disable will activate the confirm and cancel keys with a 
    * btn_enable_disable class. Pressing either of these keys will return us here.
    * We can then either enable/disable the entry or leave as is.
    ********************************************************************************/
    function controlEnableOrDisable () {        
        switch (this.id) {
            case "control_enable":
            case "control_disable":
                // Use time entry keyboard as base keyboard.
                switchToKeyboard ("time_entry_keyboard");
                
                // Add confirm and cancel keys.
                replaceKey ("key19", "confirm_key");
                replaceKey ("key20", "cancel_key");

                // Highlight 'confirm' and 'cancel' keys, use enable disable class so that we 
                // are returned to this function when either key is clicked.
                $("#control_confirm").toggleClass("btn_select btn_enable_disable");
                $("#control_cancel").toggleClass("btn_select btn_enable_disable");
                $("#control_cancel").css("border-color", "red");
                $("#control_confirm").css("border-color", "red");
                
                // Set message for action that will be taken on confirm.
                var newState = (zoneData.timers [zoneData.timer_selected].enabled) ? "Disabled" : "Enabled";

                // Display message.
                $("#bottom_line_left").text ("Set Timer " + zoneData.timer_selected +
                                            " to " + newState + 
                                            "? - 'Confirm' or 'Cancel'");
                break;

            case "control_confirm":
                // If we are in a boost mode we clear it as we are changing mode.
                if (zoneData.mode.slice (0, 6) == "boost_") {
                    // Remove "boost_" from mode string.
                    zoneData.mode = zoneData.mode.slice(6);
                }
                // Get current enable state and swap it.
                var state = zoneData.timers [zoneData.timer_selected].enabled;               
                zoneData.timers [zoneData.timer_selected].enabled = !state;
                displayCurrentTimerInfo();
                displayZoneStatus();
                // Flag we have made a change and save it.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                // Fall through as all further operations same as cancel.
            
            case "control_cancel":
                // Move back to program selection keyboard.
                lastKeyboard.pop();
                switchToKeyboard (lastKeyboard.pop());
                // Display what is now the selected entry.
                displayProgramEntry ();
                // Clear the message now we're done.
                $("#bottom_line_left").text ("");
                break;
        }
    }

    /******************************************************************************* 
    * Function: controlDelete () - button click handler.
    * 
    * Parameters:none
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Delete a timer entry. Pressing delete will activate the confirm and
    * cancel keys with a btn_delete class. Pressing either of these
    * keys will return us here. We can then either delete the entry or leave as is.
    *
    ********************************************************************************/
    function controlDelete () {
        switch (this.id) {
            case "control_delete":
                // Use time entry keyboard as base keyboard.
                switchToKeyboard ("time_entry_keyboard");
                
                // Add confirm and cancel keys.
                replaceKey ("key19", "confirm_key");
                replaceKey ("key20", "cancel_key");

                // Highlight 'confirm' and 'cancel' keys, use delete class
                // so that we are returned to this function when either key is clicked.
                $("#control_confirm").toggleClass("btn_select btn_delete");
                $("#control_cancel").toggleClass("btn_select btn_delete");
                $("#control_cancel").css("border-color", "red");
                $("#control_confirm").css("border-color", "red");

                // Highlight the whole middle line.
                $("#middle_line_program > div").css("color", "red");
                
                // Display message asking user to confirm or cancel.
                $("#bottom_line_left").text ("Delete timer " + 
                                            zoneData.timer_selected +
                                            "? - 'Confirm' or 'Cancel'");
                break;

            case "control_confirm":
                // Delete required element and dec number of entries.
                zoneData.timers.splice(zoneData.timer_selected, 1);
                zoneData.timer_entries--;
                if (zoneData.timer_selected > zoneData.timer_entries) {
                    zoneData.timer_selected--;
                }
                zoneData.zone_state = "off";
                // Flag we have made a change and save it.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                // Fall through as all further operations same as cancel.

            case "control_cancel":
                // Remove the highlight applied to the line. Clear any message.
                $("#middle_line_program > div").removeAttr("style");
                $("#bottom_line_left").text ("");
                // Move back to program selection keyboard.
                lastKeyboard.pop();
                switchToKeyboard (lastKeyboard.pop());
                // Display what is now the selected entry.
                displayProgramEntry ();
                displayCurrentTimerInfo ();
                break;
        }
    }

    /******************************************************************************* 
    * Function: controlOnAtOffAtDays () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: When the On At, Off At or Days keys are pressed we arrive here.
    * We set up the correct keyboard and highlight the field we are going to edit.
    * 
    ********************************************************************************/
    function controlOnAtOffAtDays () {

        switch (this.id) {
            case "control_on_at":
                //Move to time entry keyboard.
                switchToKeyboard ("time_entry_keyboard");
                // Change 'back' key to 'cancel' and highlight.
                replaceKey ("key20", "cancel_key");
                $("#control_cancel").toggleClass("btn_select btn_on_at_entry");
                // Start off with tens of hours valid keys (0,1,2)
                setActiveDigitKeys ("hoursTens0To2OnAt");
                // Highlight 'on at' text in display, sets cursor on digit 1.
                dataFieldOperation ("highlightOnAtDigits");
                break;

            case "control_off_at":
                //Move to time entry keyboard.
                switchToKeyboard ("time_entry_keyboard");
                // Change 'back' key to 'cancel' and highlight.
                replaceKey ("key20", "cancel_key");
                $("#control_cancel").toggleClass("btn_select btn_off_at_entry");
                // Start off with tens of hours valid keys (0,1,2)
                setActiveDigitKeys ("hoursTens0To2OffAt");
                // Highlight 'off at' text in display, sets cursor on digit 1.
                dataFieldOperation ("highlightOffAtDigits");
                break;

            case "control_days":
                //Move to day entry keyboard.
                switchToKeyboard ("day_select_keyboard");
                // Change 'back' key to 'cancel' and highlight.
                replaceKey ("key20", "cancel_key");
                $("#control_cancel").toggleClass("btn_select btn_day_entry");
                // Highlight all the 'days' keys.
                $("#current_keyboard .btn_day").toggleClass("btn_day btn_day_entry");
                // Highlight 'days' text in display.
                dataFieldOperation ("highlightDays");
                break;
        }
    }
        
    /******************************************************************************* 
    * Function: controlPreviousOrNext ()
    * 
    * Parameters: keyId - the id assigned to the key.
    * 
    * Returns:
    * 
    * Globals modified: zoneData.timer_selected
    * 
    * Comments: If there is more than one timer the previous and next keys will be
    * active as required. Pressing one will bring us here.
    * 
    ********************************************************************************/
    function controlPreviousOrNext () {
        
        // Get current value of index to program entry.
        var selectedEntry = zoneData.timer_selected;

        // Check if previous or next key.
        if (this.id == "control_previous") {
            // Previous key. If we're not at the first entry dec index.
            if (selectedEntry > 1) {
                selectedEntry--;
            }
        } else {
            // Next key. If we're not at the last entry inc index.
            if (selectedEntry < zoneData.timer_entries) {
                selectedEntry++;
            }
        }
        // Update our global data with new index value.
        zoneData.timer_selected = selectedEntry;       

        // Show entry.
        displayProgramEntry ();
        displayCurrentTimerInfo ();
    }
    
    /******************************************************************************* 
    * Function: processZoneKeys () - button click handler.
    * 
    * Parameters: None.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: There are 30 zones, 14 for rads and 16 for ufh. Pressing a zone key
    * brings us here. We highlight the zone pressed and enable the functions
    * available for this zone.
    * 
    ********************************************************************************/
    function processZoneKeys () {
        // Get the zone key that brought us here.
        var keyId = this.id;
        // The 1st zone key we get we switch to the rad or ufh zone selected keyboard.
        // Test key5 it will be 'control_set_timer' if we have already done this.
        if (($("#key5:first .btn_basic").attr("id")) != "control_set_timer") {
            
            // Are we on rad or ufh select? Rad is zones 1-14.
            if (parseInt (keyId.slice (4)) < 15) {
                // We are selecting rad zones.
                switchToKeyboard ("rad_zone_selected_keyboard");
            } else {
                // We are selecting ufh zones.
                switchToKeyboard ("ufh_zone_selected_keyboard");
            }
        }
        // Clear the select band from all zone buttons.
        $("#current_keyboard .btn_zone").removeClass('btn_zone_clicked');
        // Now set select band for this button.
        $("#current_keyboard #" + keyId).addClass('btn_zone_clicked');
        // Show which zones are on with green background.
        displayStates ();
    
        // Have we already loaded this zone? We know if a zone is loaded because
        // it will have a field of "zone" in it.
        if ("zone" in allZonesData [keyId]) {
            // Use the existing data.
            zoneData = JSON.parse (JSON.stringify (allZonesData [keyId])); 
            displayZoneTimerInfo ();
            displayZoneStatus ();
        } else {
            // Tell server which zone is required. When it responds the data
            // will be displayed.
            socket.send (JSON.stringify({"command":"zone_data_request", "payload":{"zone":keyId}}));
        }
    }
        
    /******************************************************************************* 
    * Function: processProgrammingKeys (event) - button click handler.
    * 
    * Parameters: event - click handler parameters passed here.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments:  When we are entering on/off/day digits or confirm/cancel in timer
    * programming mode we will arrive here.
    * 
    ********************************************************************************/
    function processProgrammingKeys (event) {
        // Get the parameter data. field will tell us if it is on, off or day data.
        var field = event.data.field;
        // Keep button the same when clicked.
        $(this).addClass ('btn_digit_clicked');
        // Which key?
        var keyId = this.id;
        switch (keyId) {
            case "control_confirm":
                // User wants to keep the data.
                var selectedEntry = zoneData.timer_selected;
                zoneData.timers [selectedEntry].on_at = dataFieldOperation ("readOnAtDigits");
                zoneData.timers [selectedEntry].off_at = dataFieldOperation ("readOffAtDigits");
                zoneData.timers [selectedEntry].days = dataFieldOperation ("readDayDays");
                // Cancel any boost or suspend by going back to timer mode.
                zoneData.mode = "timer";
                // Flag we have made a change and save it.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                // Fall through to cleanup.
            case "control_cancel":
                // Move back to last keyboard (program selection).
                lastKeyboard.pop();
                switchToKeyboard (lastKeyboard.pop());
                // Clear any highlighted fields.
                dataFieldOperation ("unHighlightOnAtDigits");
                dataFieldOperation ("unHighlightOffAtDigits");
                dataFieldOperation ("unHighlightDays");
                // Re-display the current program.
                displayProgramEntry ();
                break;

            default:
                // Must be a digit or day key so process as required.
                if (field == "inputDaysDay") {
                    processDayKey (keyId);
                } else {
                    processDigitKey (keyId, field);
                }
        }
    } 
    
    /******************************************************************************* 
    * Function: processDayKey (keyId)
    * 
    * Parameters: keyId - the id assigned to the key.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Sets or clears timer days. If a day is not set it will be set and
    * vice versa. For multiple day keys if any day is not set they will all be set
    * and if they are all set they will all be cleared.
    * 
    ********************************************************************************/
    function processDayKey (keyId) {
        
        // Show 'confirm' key and set active now a key pressed.
        replaceKey ("key19", "confirm_key");
        if ($("#control_confirm").hasClass("btn_select")) {
            $("#control_confirm").toggleClass("btn_select btn_day_entry");
        }

        // Lookup for day info for each day key. This gives us the index
        // for the day field and the day letter for all the days valid for the key.
        var dayInfo = {
            "day_mon":[0,"M"], "day_tue":[1,"T"], "day_wed":[2,"W"], "day_thu":[3,"T"],
            "day_fri":[4,"F"], "day_sat":[5,"S"], "day_sun":[6,"S"],
            "day_mon_fri":[0,1,2,3,4,"M","T","W","T","F"],
            "day_sat_sun":[5,6,"S","S"],
            "day_every_day":[0,1,2,3,4,5,6,"M","T","W","T","F","S","S"]
        };
        
        // Get where this day field is. For muliple day keys it is the 1st day
        // of the muliple days (e.g. Sat & Sun = 6) .
        var startIndex = dayInfo [keyId][0];
        // Get the number of day fields to scan. The lookup entries have 2 elements per day
        // (the index and the letter) so we halve that.
        var numberOfFields = (dayInfo [keyId].length)/2;
        // Flag to show if we set or clear a day field.
        var fieldSet = false;
        
        // Scan through the required day fields. We start at the required day
        for (var index = startIndex, letterIndex = 0; letterIndex < numberOfFields; letterIndex++, index++  ) {
            
            // Get the existing day field, it will either be a letter M,T,W,F,S or _.
            var currentDay =  $("#middle_line #days_day_" + index).text().trim();
            
            // If the field has no letter then set the letter and flag we have set one.
            // index is pointing to the day field. Because numberOfFields is (number of elements)/2
            // it is pointing to the start of the day letters so if we add the letterIndex we
            // are pointing at the letter to insert.
            if (currentDay == "_") {
               $("#middle_line #days_day_" + index).text(dayInfo[keyId][letterIndex + numberOfFields]);
               fieldSet = true;
            } 
        }
        letterIndex = 0;
        // If we didn't set a field then it (they) were already all set so clear it (them).
        if (fieldSet == false) {
           for (var index = startIndex; letterIndex < numberOfFields; letterIndex++, index++  ) {
               $("#middle_line #days_day_" + index).text("_");
           }
        }
    }
    
    /******************************************************************************* 
    * Function: processDigitKey (keyId, operation)
    * 
    * Parameters: keyId - the id assigned to the key.
    *             operation - specifies if key is to be used for off or on times.
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Gets digit keys from our keyboard and places them at the correct
    * digit location. Only those digits that are valid for the digit location will
    * be set active (e.g. Hours tens can only be 0,1 &2). Also controls the position
    * of the flashing cursor.
    * 
    ********************************************************************************/
    function processDigitKey (keyId, operation) {

        // Lookup to get data required for on or off digits.
        var fieldInfo = {
            "inputOnAtDigit":
                {field:"on_at_", digitsToUpdate:"updateOnAtDigits", keyType:"OnAt"},
            "inputOffAtDigit":
                {field:"off_at_", digitsToUpdate:"updateOffAtDigits", keyType:"OffAt"}
        };
        // Get all the data for this operation into object.
        var op = fieldInfo [operation];

        // Find the current cursor location by looking for our cursor class.
        var selectedDigit;
        for (var digitIndex = 0; digitIndex < 5; digitIndex++) {
            // Create selector for location.
            selectedDigit = "#" + op.field + "digit_" + digitIndex; 
            // If we find the cursor exit. digitIndex will have the cursor location.
            // selectedDigit will have the cursor selector.
            if ( $("#middle_line" + " " + selectedDigit).hasClass (op.field + "field_selected_cursor")) {
                break;
            }    
        }
        // If this is the 1st digit location clear the current entry.
        // Remove 'confirm' key. We will display it when all 4 digits entered.
        // Clear any warning message.
        if (digitIndex == 0) {
            dataFieldOperation (op.digitsToUpdate, "__:__");
            replaceKey ("key19", "blank_key");
            $("#bottom_line_left").text ("");
        }
        
        // Get the digit from our keyboard and put it at the cursor selector.
        var digit = $("#current_keyboard #" + keyId).text();
        $("#middle_line" + " " + selectedDigit).text (digit);
        
        // Update cursor position and decide what to do depending where we are.
        digitIndex++;
        
        // If we're at the hours units we have to see what hours tens are and
        // only allow 0-3 if it is 2.
        if (digitIndex == 1) {
            if (digit == 2) {
                setActiveDigitKeys ("hoursUnits0To3" + op.keyType);
            } else {
                setActiveDigitKeys ("allUnits" + op.keyType);
            }
        
        // If we're at the colon move to tens of minutes and set 0-5 digits active.
        } else if (digitIndex == 2) {
            digitIndex++;
            setActiveDigitKeys ("minutesTens" + op.keyType);
        
        // If we're at minutes units set all digits active.    
        } else if (digitIndex == 4) {
            setActiveDigitKeys ("allUnits" + op.keyType);
        
        // If we're at the end wrap back to tens of hours and set 0-2 digits active.
        // Enable 'confirm' key.
        } else if (digitIndex > 4) {
            digitIndex = 0;
            setActiveDigitKeys ("hoursTens0To2" + op.keyType);
            replaceKey ("key19", "confirm_key");
            if ($("#control_confirm").hasClass("btn_select")) {
                $("#control_confirm").toggleClass("btn_select btn_" + op.field + "entry");
            }
        }
        
        // Create selector for next location.
        var nextSelectedDigit = "#" + op.field + "digit_" + digitIndex; 
       
        // All further field accesses include 'field_selected' so add it.
        op.field += "field_selected";
                
        // Turn cursor off at this location.
        $("#middle_line" + " " + selectedDigit).toggleClass(op.field +"_cursor " + op.field);
        
        // Turn cursor on at next location
        $("#middle_line" + " " + nextSelectedDigit).toggleClass(op.field + "_cursor " + op.field);      
    }

    /******************************************************************************* 
    * Function: dataFieldOperation (operation, fieldText)
    * 
    * Parameters: operation - specifies the operation to perform - highlight etc
    *             fieldText - text to load (if required).
    * 
    * Returns: the digit if we do a read operation.
    * 
    * Globals modified: None.
    * 
    * Comments: Highlights, un-highlights, updates the 'on at', 'off at' and 'days'
    * fields. Starts blinking of 1st digit.
    * 
    ********************************************************************************/ 
    function dataFieldOperation (operation, fieldText) {

        // Lookup to get data required for each type of operation. For a supplied
        // operation we will lookup the field to use: on off or days, whether it is
        // a digit or day and what we want to do: highlight, read etc
        var fieldInfo = {
            "highlightOnAtDigits":
                {field:"on_at_", fieldType:"digit_", action:"highlight"},
            "unHighlightOnAtDigits":
                {field:"on_at_", fieldType:"digit_", action:"unHighlight"},
            "updateOnAtDigits":
                {field:"on_at_", fieldType:"digit_", action:"update", digits:5},
            "readOnAtDigits":
                {field:"on_at_", fieldType:"digit_", action:"read", digits:5},
            "highlightOffAtDigits":
                {field:"off_at_", fieldType:"digit_", action:"highlight"},
            "unHighlightOffAtDigits":
                {field:"off_at_", fieldType:"digit_", action:"unHighlight"},
            "updateOffAtDigits":
                {field:"off_at_", fieldType:"digit_", action:"update", digits:5},
            "readOffAtDigits":
                {field:"off_at_", fieldType:"digit_", action:"read", digits:5},
            "highlightDays":
                {field:"days_", fieldType:"day_", action:"highlight"},
            "unHighlightDays":
                {field:"days_", fieldType:"day_", action:"unHighlight"},
            "updateDaysDay":
                {field:"days_", fieldType:"day_", action:"update", digits:7},
            "readDayDays":
                {field:"days_", fieldType:"day_", action:"read", digits:7}
        };
        // Get all the data for this operation into object.
        var op = fieldInfo[operation];
        // Create digit type. We use this for working on each digit.
        var selectedDigit = op.field + op.fieldType;
        // Create field type. We use this for working on a field of digits.
        var selectedField = op.field + "field";

        switch (op.action) {
            
            case "read":
                fieldText = "";
                // Copy displayed digits/days into feldText and return to caller.
                // Note: trim is used to remove unexplained leading spaces!
                for (var digitIndex = 0; digitIndex < op.digits; digitIndex++) {
                    fieldText += $("#middle_line #" + selectedDigit + digitIndex).text ().trim();
                }
                // Send read digits/days back to caller.
                return (fieldText);

            case "update":
                // Copy the supplied fieldText into the displayed digits/days.
                for (var digitIndex = 0; digitIndex < op.digits; digitIndex++) {
                    $("#middle_line #" + selectedDigit + digitIndex).text (fieldText [digitIndex]);
                }
                return ("");

            case "highlight":
                // Highligtht the field. 
                $("#middle_line ." + selectedField).toggleClass (
                selectedField + " " + selectedField + "_selected");
                // Start 1st digit blinking for digits only.                                                 
                if (op.fieldType == "digit_") {
                    $("#middle_line ." + selectedField + "_selected:first").toggleClass (
                        selectedField + "_selected " + selectedField + "_selected_cursor");
                }
                return ("");
                
            case "unHighlight":
                // Restore field to normal no blinking cursor.
                $("#middle_line ." + selectedField + "_selected_cursor").toggleClass (
                selectedField + "_selected_cursor " + selectedField);
                // Restore field to normal no highlight.
                $("#middle_line ." + selectedField + "_selected").toggleClass (
                    selectedField + "_selected " + selectedField);
                return ("");
        }
    }
    
    /******************************************************************************* 
    * Function: setActiveDigitKeys (operation)
    * 
    * Parameters: operation - string - describes which keyboard digits are active
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Sets only those digits active that are allowed for the digit
    * position. E.g. Only digits 0,1 and 2 alloed for hours tens position. Also
    * specifies if the key will be for on or off digit entry.
    * 
    ********************************************************************************/
    function setActiveDigitKeys (operation) {
        
        // Lookup to get data required for each type of operation.
        var fieldInfo = {
            "hoursTens0To2OnAt":{field:"on_at_", maxDigit:2},
            "hoursTens0To2OffAt":{field:"off_at_", maxDigit:2},
            "minutesTensOnAt":{field:"on_at_", maxDigit:5},
            "minutesTensOffAt":{field:"off_at_", maxDigit:5},
            "hoursUnits0To3OnAt":{field:"on_at_", maxDigit:3},
            "hoursUnits0To3OffAt":{field:"off_at_", maxDigit:3},
            "allUnitsOnAt":{field:"on_at_", maxDigit:9},
            "allUnitsOffAt":{field:"off_at_", maxDigit:9}
        };
        // Get all the data for this operation into object.
        var op = fieldInfo [operation];

        // Scan through all the digits.
        for (var digit = 0; digit <= 9; digit++){
            // Clear back to basic button.
            $("#current_keyboard #digit_" + digit).removeClass("btn_digit  btn_" + op.field + "entry");
            // Do we need to make button active?
            if (digit <= op.maxDigit) {
                // Make digit active by giving it a class that specifies if it is on or off entry. Then
                // when digit is pressed we will know if it is for on or off.
                $("#current_keyboard #digit_" + digit).addClass("btn_" + op.field + "entry");
            } else {
                // Digit not valid for this position so just set as basic digit.
                $("#current_keyboard #digit_" + digit).addClass("btn_digit");
            }          
        }
    }
    
    /******************************************************************************* 
    * Function: displayProgramEntry ()
    * 
    * Parameters: 
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments: Uses the middle line of the display to show the current data for the
    * selected timer. If there are no timers then we remove any invalid keys and
    * tell user.
    * 
    ********************************************************************************/

    function  displayProgramEntry () {
        
        // Clear the middle display line.
        $("#display_entries").text ("");
        $("#middle_line_program > div").text("");
        
        // If there are no entries tell the user and remove invalid keys.
        if (zoneData.timer_entries == 0) {
            $("#middle_line_program #status_text").text ("'New' to create a timer");
            // Remove the 'on at', 'off at', 'days', 'enable' and 'delete' keys.
            replaceKey ("key4", "blank_key");
            replaceKey ("key9", "blank_key");
            replaceKey ("key14", "blank_key");
            replaceKey ("key18", "blank_key");
            replaceKey ("key19", "blank_key");
        } else {
            // Get the timer number are we working on.
            var selectedEntry = zoneData.timer_selected;
            // Now populate middle display line to show on time, off time  and days.
            $("#middle_line_program #turn_on_text").text ("Turn on at" + "\xa0");
            dataFieldOperation ("updateOnAtDigits", zoneData.timers [selectedEntry].on_at);
            $("#middle_line_program #turn_off_text").text ("\xa0" + "Turn off at" + "\xa0");
            dataFieldOperation ("updateOffAtDigits", zoneData.timers [selectedEntry].off_at);
            $("#middle_line_program #days_text").text ("\xa0" + "On days" + "\xa0");
            dataFieldOperation ("updateDaysDay", zoneData.timers [selectedEntry].days);
            
            // Tell user if it is a valid timer.
            checkIfValidTimes ();
            
            // Display number of program entries on the right of the middle line.
            $("#display_entries").text ("(Timer " +
                                        selectedEntry + 
                                        " of " +
                                        zoneData.timer_entries +
                                        ")");

            // Set enable key if we are not enabled and vice versa.
            if (zoneData.timers [selectedEntry].enabled) {
                replaceKey ("key19", "disable_key");
            } else {
                replaceKey ("key19", "enable_key");
            }
            // Display previous and next keys as required.
            updatePreviousNextKeys ();
        }   
    }
    
    /******************************************************************************* 
    * Function: updatePreviousNextKeys ()
    * 
    * Parameters:
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments:
    * 
    ********************************************************************************/   
    function updatePreviousNextKeys () {
        
        // If there are no entries blank the 'Previous' and 'Next' keys.
        if (zoneData.timer_entries == 0) {
            replaceKey ("key5", "blank_key");
            replaceKey ("key10", "blank_key");
        } else {
            // Get current value of selected index.
            var selectedEntry = zoneData.timer_selected;
            
            // If we're at the first entry blank the 'previous' key else display it.
            if (selectedEntry == 1) {
                replaceKey ("key5", "blank_key");
            } else {
                replaceKey ("key5", "previous_key");
            }
            // If we're at the last entry blank the 'next' key else display it.
            if (selectedEntry == zoneData.timer_entries) {
                replaceKey ("key10", "blank_key");
            } else {
                replaceKey ("key10", "next_key");
            }
        }
    }

    /******************************************************************************* 
    * Function: checkIfValidTimes ()
    * 
    * Parameters:
    * 
    * Returns: True if times are OK, else False.
    * 
    * Globals modified:
    * 
    * Comments: Checks to see if a timer has valid times and days. We also check to
    * see if the timer has any overlap with another timer for this zone. We regard
    * this as a valid situation as it is possible the user may want to have timers
    * covering the same time period and then enable them as required.
    * 
    ********************************************************************************/

    function checkIfValidTimes () {
        
        // Get the timer number and the times.
        var selectedEntry = zoneData.timer_selected;
        var onTime = zoneData.timers [selectedEntry].on_at;
        var offTime = zoneData.timers [selectedEntry].off_at;
        var days = zoneData.timers [selectedEntry].days;
        
        // If we have invalid times or there are no days warn user and exit false.
        if ((onTime >= offTime) || (days == "_______")) {
            $("#bottom_line_left").text ("Warning: invalid times or no days set.");
            return (false);
        }
        // Get here if we have a valid time so clear any warning message.
        $("#bottom_line_left").text ("");
        // Scan through all the timers for this zone to see if the selected
        // times conflict with another timer.
        for (var timer = 1; timer <= zoneData.timer_entries; timer++) {
            // Only check if it is not our own entry.
            if (timer != selectedEntry) {
                // Check if any day matches, ignore '_'.
                for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
                    if ((days [dayIndex] == zoneData.timers [timer].days [dayIndex])
                       &&
                       (days [dayIndex] != "_")) {
                        // Check if on or off falls within another timer or
                        // we completely encompass another timer. We allow
                        // on time to be off time of previous timer. 
                        if (((onTime >= zoneData.timers [timer].on_at) &&
                             (onTime < zoneData.timers [timer].off_at))
                             ||
                             ((offTime > zoneData.timers [timer].on_at) &&
                              (offTime <= zoneData.timers [timer].off_at))
                             ||
                             ((onTime <= zoneData.timers [timer].on_at) &&
                              (offTime >= zoneData.timers [timer].off_at))) {
                            
                            $("#bottom_line_left").text ("Warning: Conflict with timer " + timer);
                            break; 
                        }
                    }
                }
            }
        }
        // We say time is OK even if timers conflict as user may want overlapping times.
        return (true);
    }
     
    /******************************************************************************* 
    * Function: displayStates ()
    * 
    * Parameters: None.
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Sets the background of any zone keys that are on to green. If a zone
    * is going to change state we flash green for off to on and red for on to off.
    * 
    ********************************************************************************/

    function displayStates () {
        // Check each zone.
        for (var zone in allZonesData) {
            // Get key object for a zone.
            var key = $("#current_keyboard #" + zone);
            // Make sure the zone is present. If we're on rads keyboard there will be
            // no ufh zones and vice versa.
            if (key.length) {
                var currentState = allZonesData [zone]["zone_state"];
                var lastState = allZonesData [zone]["last_zone_state"];
                // Take key back to basic style.
                key.removeClass("btn_solid_green");
                key.removeClass("btn_flash_green");
                key.removeClass("btn_flash_red");
                // If zone was and still is on set green.
                if ((currentState == "on") && (lastState == "on")) {
                    key.addClass("btn_solid_green");
                } else if ((currentState == "on") && (lastState == "off")) {
                    key.addClass("btn_flash_green");
                } else if ((currentState == "off") && (lastState == "on")) {
                    key.addClass("btn_flash_red");
                }
            }
        }
    }

    /******************************************************************************* 
    * Function: displayCurrentTimerInfo ()
    * 
    * Parameters: None.
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Displays the timer info of the selected timer.
    * 
    ********************************************************************************/
    function displayCurrentTimerInfo () {
        var currentTimer = zoneData.timer_selected;
        if (zoneData.timer_entries >= 1) {
            // Start the message with zone name.
            var infoMessage = zoneData.name + " - timer " + currentTimer + " - ";
            if (!(zoneData.timers [currentTimer].enabled)) {
                infoMessage += "not ";
            }
            infoMessage += "enabled";
            // Display message at top left of display.
            $("#display_top1").text (infoMessage);
        }
    }

    /******************************************************************************* 
    * Function: displayZoneTimerInfo ()
    * 
    * Parameters: None.
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Displays the general timer info of the selected zone.
    * 
    ********************************************************************************/
    function displayZoneTimerInfo () {
        var numberOfTimers = zoneData.timer_entries;
        // Start the message with zone name.
        var infoMessage = zoneData.name + " - ";
        // Add number of timers.
        if (numberOfTimers) {
            infoMessage += numberOfTimers; 
        } else {
            infoMessage += "no";
        }
        infoMessage += " timer";
        // If there is more than 1 timer we need a plural s?
        if (numberOfTimers != 1) {
            infoMessage += "s";
        }
        // Do we have timers?
        if (numberOfTimers) {
            // We have timers so more message is required, add a dash.
            infoMessage += " - ";
            //  Create list of enabled timers.
            var timerList = [];
            for (var timerNumber = 1; timerNumber <= numberOfTimers; timerNumber++){
                if (zoneData.timers [timerNumber].enabled) {
                    timerList.push (timerNumber);
                }
            }
            // Get number of enabled timers?
            var timersEnabled = timerList.length;
            // Are any enabled?
            if (timersEnabled) {
                // Are they all enabled?
                if (timersEnabled == numberOfTimers) {
                    // Adjust wording for 1,2 or all.
                    if (numberOfTimers == 2) {
                        infoMessage += "both ";
                    } else if (numberOfTimers != 1) {
                        infoMessage += "all ";
                    }
                } else {
                    // Only some enabled.
                    infoMessage += "timer";
                    // If there is more than 1 enabled we need a plural s?
                    if (timersEnabled != 1) {
                        infoMessage += "s";
                    }
                    // Add each one to message, use comma or and as needed.
                    for (var i = 1; i <= timersEnabled; i++) {
                        infoMessage += (" " + timerList.shift ());
                        if (timerList.length > 1) {
                            infoMessage += ", ";
                        } else if (timerList.length == 1) {
                            infoMessage += " and ";
                        }
                    }
                    // Finish message with a space before last word.
                    infoMessage += " ";
                }
            } else {
                // No timers enabled. Adjust wording for 1,2 or all.
                if (numberOfTimers == 2) {
                    infoMessage += "neither ";
                } else if (numberOfTimers != 1) {
                    infoMessage += "none ";
                } else {
                    infoMessage += "not ";
                }
            }
            // Last word of message.
            infoMessage += "enabled";
        }
        // Display message at top left of display.
        $("#display_top1").text (infoMessage);
    }
       
    /******************************************************************************* 
    * Function: displayZoneStatus ()
    * 
    * Parameters: None.
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Displays the current status of the selected zone.
    * 
    ********************************************************************************/
    
    function displayZoneStatus () {
        // Lookup for on/off part of status display.
        var statusMessage = {"on": "On",
                             "off":"Off",
                             "unknown": "Not known"
        };
        
        // Remove 'resume' or 'suspend' key if present. We will add below.
        replaceKey ("key15", "blank_key");
        
        // Convert UTC on and off times to string and get time and day parts.
        var offTime = (new Date(zoneData.next_off_time*1000)).toUTCString ();
        offTime = offTime.slice (16, 22) + " " + offTime.slice (0, 3);
        
        var onTime = (new Date(zoneData.next_on_time*1000)).toUTCString ();
        onTime = onTime.slice (16, 22) + " " + onTime.slice (0, 3);
        
        var boostOffTime = (new Date(zoneData.boost_off_time*1000)).toUTCString ();
        boostOffTime = boostOffTime.slice (16, 22) + " " + boostOffTime.slice (0, 3);
        
        // Start the status message here with the state of the zone.
        // This is the message we will use for manual mode.
        var status = "Current status: " + statusMessage[zoneData.zone_state] + " ";

        // If we are on boost we use the boost status message.
        if (zoneData.mode.slice (0, 6) == "boost_") {
            status = ("Current status: On boost until " + boostOffTime);
            // We set the boost key to boost off here so that whenever we return to
            // a zone that is on boost we can turn it off. If the boost 1 hour key
            // was the last key pressed then it will replace the boost off key with
            // the boost 2 hours key after we return from this function.
            replaceKey ("key10", "boost_off_key");

        } else {
            // Not on boost so display boost 1 hour key.
            replaceKey ("key10", "boost_1_hour_key");
            
            console.log ("ON TIME ",zoneData.next_on_time);
            console.log ("OFF TIME ",zoneData.next_off_time);
            console.log ("ENABLED  ",zoneData.timers [zoneData.timer_active].enabled);
            console.log ("ENTRIES  ",zoneData.timer_entries);
            // If we have an active valid timer there will be times to display.
            if ((zoneData.timer_active)
                &&
                (zoneData.next_on_time != zoneData.next_off_time)) {
                
                // Are we 'on' or are we 'suspended'?
                if (zoneData.zone_state == "on") {
                    // We are 'on' so set 'suspend' key active.
                    replaceKey ("key15", "suspend_key");
                    // We will display the next off time.
                    status += ("until " + offTime);
                    
                } else {
                    // We must be 'suspended' so set 'resume' key active.
                    replaceKey ("key15", "resume_key");
                    // We will display the next on time.
                    status += ("(suspended) until " + onTime);
                
                }
            } else {
                // No active timer. We will display the next on time if we have one.
                if (zoneData.next_on_time) {
                    status += ("until " + onTime);
                }
            }
                
        }
        // Clear the line and display status.
        $("#middle_line_program > div").text ("");
        $("#middle_line_program #status_text").text (status);
    }

    /******************************************************************************* 
    * Function: replaceKey (location, key) 
    * 
    * Parameters: location - the physical key position on the keyboard.
    *             key - the name of the new key (this is not the id).
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Replaces the key at location with the new 'key'. 
    * 
    ********************************************************************************/
    
    function replaceKey (location, key) {
        // Clone the key holder and the key to the location.
        $("#current_keyboard #" + location).replaceWith($("#clone_keys #" + key).clone());
        // Now change the key holder name to the physical location. If we didn't do this
        // we would not be able to access the physical key location again.
        $("#" + key + ":first").attr("id", location);
    }

    /******************************************************************************* 
    * Function: switchToKeyboard (newId)
    * 
    * Parameters: newId - the id of the keyboard to switch to.
    * 
    * Returns: Nothing.
    * 
    * Globals modified: lastKeyboard[] - array of keyboard ids used.
    * 
    * Comments: We keep all of the keyboards that we use hidden and then clone the 
    * one required to an empty div and make it visible. We do this so that the original
    * keyboard is not modified, by changing keys etc. Before we load the next keyboard
    * we remove the previous cloned one. For some keyboards we only update certain keys.
    * In this case we use a lookup to check which keys to update.
    ********************************************************************************/

    function switchToKeyboard (newId) {
        // For each keyboard where we change only keys we hold the keyboard id and
        // an array of the old and new key ids that we will change.
        var keyChange = {
            "rad_zone_selected_keyboard":{
                "baseKeyboard":
                    "rad_select_keyboard",
                "keyChanges":{
                    "key5":"set_timer_key",
                    "key10":"blank_key",
                    "key15":"blank_key",
                    "key20":"back_key"
                }
            },
            "ufh_zone_selected_keyboard":{
                "baseKeyboard":
                    "ufh_select_keyboard",
                "keyChanges":{
                    "key5":"set_timer_key",
                    "key10":"blank_key",
                    "key15":"blank_key",
                    "key20":"back_key"
                }
            }
        };
        // Lists of keyboards on the 'same' level. See note below.
        var selectLevel = {"rad_select_keyboard":"rad", "ufh_select_keyboard":"ufh"};

        // Save the current active keyboard so we can return to it if 'Back' is pressed.
        // For keyboards that are on the same 'level', such as the rad and ufh select
        // keyboards we will simply replace the last saved id rather than 'pushing'
        // it so we always move up a level and not to a keyboard on the same level.
        
        // If this is our 1st keyboard simply save the id to start our list.
        if (!(lastKeyboard.length)) {
            lastKeyboard.push (newId);
        } else {
            // Get last keyboard. Note we are popping  it off list.
            var lastId = lastKeyboard.pop();

            // Check if new keyboard is on same level as previous keyboard.
            if ((newId in selectLevel) && (lastId in selectLevel)) {
                // If it is save new id. Replaces old id as we popped it.    
                lastKeyboard.push (newId);

            } else {
                // Keyboards on different levels so put last keyboard id back and
                // save new keyboard id.
                lastKeyboard.push (lastId);
                lastKeyboard.push (newId);
            }
        }
        var keyboardId = newId;
        // If this is a keyChange keyboard we use the base keyboard to load.
        if (newId in keyChange) {
            keyboardId = keyChange[newId]["baseKeyboard"];
        }
        // Remove the current_keyboard to make space for the new keyboard.
        // Clone the new keyboard into the space and change it's id to "current_keyboard".
        // Then make it visible. BEWARE: We used clone so we will have duplicate id's.
        $("#current_keyboard").remove ();
        $("#" + keyboardId).clone().prependTo ($("#blank_keyboard"));
        $("#" + keyboardId + ":first").attr("id","current_keyboard");
        $("#current_keyboard").removeClass ("hide_keyboard");

        // If this is a keyChange keyboard we now need to change the required keys?
        if (newId in keyChange) {
            // Get the list of keys to change and the new keys.
            var keyChangeList = keyChange[newId]["keyChanges"];
            var changeKey, newKey;
            //  Scan through each key to change.
            for (changeKey in keyChangeList) {
                newKey = keyChangeList[changeKey];
                replaceKey (changeKey, newKey);
            }
        }
        // If we are now on the heating initial select level display the initial prompt.
        if (newId in selectLevel)   {
            // Clear mode info on top line and entires on middle line.
            $("#display_top1").text ("");
            $("#display_entries").text ("");
            
            // Clear any text and display prompt.
            $("#middle_line_program > div").text("");
            $("#middle_line_program #status_text").text ("Select room " + selectLevel[newId] + " or move to other function.");
        }
        if (newId == "main_function_keyboard")   {
            // Clear mode info on top line and entires on middle line.
            $("#display_top1").text ("");
            $("#display_entries").text ("");
            
            // Clear any text and display prompt.
            $("#middle_line_program > div").text("");
            $("#middle_line_program #status_text").text ("Select function.");
        }
    }
    
    /******************************************************************************* 
    * Function: getTime (increment, startTime)
    * 
    * Parameters: increment - number of hours to add to returned time.
    *             startTime - the time to start with as UTC.
    * 
    * Returns: The as UTC 1 second ticks
    * 
    * Globals modified:
    * 
    * Comments: With no parameters returns the current time. Supplying parameters
    * allows you to set the time you start with and/or add an offset to hours.
    * 
    ********************************************************************************/

    function getTime (increment=0, startTime="current") {
        
        if (startTime =="current") {
            startTime = Date.now() / 1000;
        }
        return startTime + increment * 3600;
        
    }

    function blinker () {
        var d = new Date ();
        var n = d.toUTCString ();
        $("#display_top3").text (n.slice (16,26) + n.slice (0,3));
    }
});

