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

    // Called when socketio connects.
    socket.on('connect', function() {
        console.log ('Connected');
    });
    
    // Called when we get a message from server.
    socket.on('message', function (msg) {
        // Commands from the server are json strings.
        // Convert received json message to object and run the command.
        var messageData = JSON.parse(msg);
        switch (messageData.command) {
            case "zone_check_reply":
            case "zone_data_reply":
                // The server has replied to a request for data for a zone.
                // Keep a copy in our current zone data and also in all our
                // zone data. We keep in the latter so we do not have to
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
                //console.log ("STATUS",allZonesData[zoneData.zone]);
                displayMode ();
                displayStatus ();
                displayStates ();
                break;
            
                case "console_message":
                console.log ("SERVER", messageData.payload);
                break;

                case "zone_states":
                allZonesData = JSON.parse(msg).payload;
                //console.log ("STATES", allZonesData);
                displayStates ();

                break;
            }
    });
    
    // Is this a function key?
    $("#keyboards").on('click', '.btn_function', function (event) {
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
    });
        
    // Is this a zone key?
    $("#keyboards").on('click', '.btn_zone', function (event) {
        // Test key5 it will be 'control_set_timer' if we have already done this.
        if (($("#key5:first .btn-basic").attr("id")) != "control_set_timer") {
            
            // Are we on rad or ufh select? Rad is zones 1-14.
            if (this.id < "zone15") {
                // We are selecting rad zones.
                switchToKeyboard ("rad_zone_selected_keyboard");
            } else {
                // We are selecting ufh zones.
                switchToKeyboard ("ufh_zone_selected_keyboard");
            }
        }
        // Clear the select band from all zone buttons.
        $("#current_keyboard .btn_zone").removeClass('btn-zone-clicked');
        // Set select band for this button.
        $("#current_keyboard #" + this.id).addClass('btn-zone-clicked');
        // Show which zones are on.
        displayStates ();
    
        // Have we already loaded this zone? We know if a zone is loaded because
        // it will have a field of "zone" in it.
        if ("zone" in allZonesData [this.id]) {
            // Use the existing data.
            zoneData = JSON.parse (JSON.stringify (allZonesData [this.id])); 
            displayMode ();
            displayStatus ();
        } else {
            // Tell server which zone is required. When it responds the data
            // will be displayed.
            socket.send (JSON.stringify({"command":"zone_data_request", "payload":{"zone":this.id}}));
        }
    });
        
    // Is this a control key?
    $("#keyboards").on('click', '.btn-select', function (event) {
        $(this).addClass('btn-select-clicked');

        switch (this.id) {
            case "control_rads":
                switchToKeyboard ("rad_select_keyboard");
                displayStates ();
                break;
                
            case "control_ufh":
                switchToKeyboard ("ufh_select_keyboard");
                displayStates ();
                break;
                
            case "control_set_timer":
                switchToKeyboard ("timer_set_keyboard");
                // As this is a new zone we reset the selected index.
                zoneData.timer_selected = 1;
                // Display 1st entry.
                displayProgramEntry (1);
                break;
                
            case "control_on_at":
                controlOnAt ();
                break;
                
            case "control_off_at":
                controlOffAt ();
                break;
                
            case "control_days":
                controlDays ();
                break;
            
            case "control_delete":
                controlDelete ();
                break;
                
            case "control_program_man":
                controlProgramMan ();
                break;
                
            case "control_resume":
                // We can only have been suspended if we were timed so put zone
                // back to timer.
                zoneData.mode = "timer";
                zoneData.zone_state = "on";
                // Flag we have made a change and re-display current status.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                displayStatus ();
                displayStates ();
                // Change resume key to suspend key.
                replaceKey ("key15", "suspend_key");
                break;
                
            case "control_suspend":
                // Suspend key can only be present in timer mode.
                // Set zone to suspended and off.
                zoneData.mode = "suspended";
                zoneData.zone_state = "off";
                // Flag we have made a change and re-display current status.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                displayStatus ();
                displayStates ();
                // Change suspend key to resume key.
                replaceKey ("key15", "resume_key");
                break;
                
            case "control_boost_1_hour":
                // If we are in 'timer' mode and on add boost to
                // the off time, othewise use the current time.
                if (zoneData.mode == "timer") {
                    // Flag we are now in boost mode.
                    zoneData.mode = "boost_" + zoneData.mode;
                    if (zoneData.zone_state == "on") {
                        zoneData.boost_off_time = getTime (1, zoneData.next_off_time);
                    } else {
                        zoneData.boost_off_time = getTime (1, "current");
                    }
                } else {
                    // Add boost to current time as we are in manual or suspended mode.
                    zoneData.boost_off_time = getTime (1, "current");
                    // Flag we are now in boost mode.
                    zoneData.mode = "boost_" + zoneData.mode;
                }
                // Flag we have turned zone on and re-display current status.
                zoneData.zone_state = "on";
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                displayStatus ();
                displayStates ();
                //console.log ("BOOST", allZonesData);
                // Change boost key to 2 hours so user can press boost key
                // twice to get 2 hours. This must be after displayStatus() as
                // displayStatus() sets the boost key to boost off. 
                replaceKey ("key10", "boost_2_hours_key");
                break;
                
            case "control_boost_2_hours":
                // We are already in 'boost' mode so add another 1 hour boost to
                // the boost time.
                zoneData.boost_off_time = getTime (1, zoneData.boost_off_time);
                // Flag we have made a change and re-display current status.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                displayStatus ();
                displayStates ();
                // We do not need to set boost key here as displayStatus will
                // set it to boost off.
                break;
                
            case "control_boost_off":
                // Put mode back to how it was before boost by removing "boost_" from
                // the mode string.
                zoneData.mode = zoneData.mode.slice(6);
                // Flag we have made a change and update zone info.
                zoneData.zone_state = "off";
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                // We may have boosted a timer so we need to check if it is still active.
                // We will do a zone check this will cause the server to send the zone
                // data to us which will then be re-displayed in the callback.
                socket.send (JSON.stringify ({"command":"zone_data_check", "payload":zoneData}));
                // Note: We do not need to set boost key here as displayStatus will
                // set it to boost 1 hour.
                break;
                
            case "control_new":
                // Create and display  a new entry at the end of current entries.
                zoneData.timers.push ({"on_at":"00:00", "off_at":"00:00", "days": "_______"});
                zoneData.timer_entries += 1;
                zoneData.timer_selected = zoneData.timer_entries;
                displayProgramEntry (zoneData.timer_selected);
                // Add the 'on at', 'off at', 'days' and 'delete' keys.
                replaceKey ("key4", "on_at_key");
                replaceKey ("key9", "off_at_key");
                replaceKey ("key14", "days_key");
                replaceKey ("key18", "delete_key");
                break;
            
            case "control_previous":
            case "control_next":
                controlPreviousOrNext (this.id);
                break;

            case "control_finished":
                updateServer ();
            case "control_back":
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
                // If we're on a zone select we need to re-select it and
                // get the server to check the zone so that we get any
                // change in state that new timers may have caused.
                // Checking the zone does not cause the server to change
                // the actual zone hardware state. This will only happen
                // when we are "Finished".
                if ((previousKeyboard == "rad_zone_selected_keyboard")
                    ||
                    (previousKeyboard == "ufh_zone_selected_keyboard")) {
                    $("#current_keyboard #" + zoneData.zone).addClass('btn-zone-clicked');
                    // Do a zone check this will cause the server to send the zone
                    // data to us which will then be re-displayed in the callback.
                    socket.send (JSON.stringify ({"command":"zone_data_check", "payload":zoneData}));
                }
                displayStates ();
                break;
        }
    });
    
    // Is this an 'on at' time entry key?
    // These will be digits 0-9, plus the 'confirm' and 'cancel' keys.
    $("#keyboards").on('click', '.btn_on_at_entry', function (event) {
        $(this).addClass('btn-digit-clicked');
        processProgrammingKeys (this.id, "inputOnAtDigit");
    });
    
    // Is this an 'off at' time entry key?
    // These will be digits 0-9, plus the 'confirm' and 'cancel' keys.
    $("#keyboards").on('click', '.btn_off_at_entry', function (event) {
    $(this).addClass('btn-digit-clicked');
        processProgrammingKeys (this.id, "inputOffAtDigit");
    });
    
    // Is this a 'day' entry key?
    // These will be day keys, plus the 'confirm' and 'cancel' keys.
    $("#keyboards").on('click', '.btn_day_entry', function (event) {
        $(this).addClass('btn-digit-clicked');
        processProgrammingKeys (this.id, "inputDaysDay");
    });
 
 
    // Is this a 'confirm' or 'cancel' key for a delete operation?
    $("#keyboards").on('click', '.btn_confirm_cancel_delete', function (event) {
        $(this).addClass('btn-digit-clicked');
        switch (this.id) {
            case "control_confirm":
                // Delete required element and dec number of entries.
                zoneData.timers.splice(zoneData.timer_selected, 1);
                zoneData.timer_entries--;
                if (zoneData.timer_selected > zoneData.timer_entries) {
                    zoneData.timer_selected--;
                }
                // Flag we have made a change and re-display current status.
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
                displayProgramEntry (zoneData.timer_selected);
                break;
        }
    });
 
    // Is this a 'confirm' or 'cancel' key for an program/manual operation?
    $("#keyboards").on('click', '.btn_confirm_cancel_program_man', function (event) {
        $(this).addClass('btn-digit-clicked');
        switch (this.id) {
            case "control_confirm":
                // If we are in a boost mode we clear it as we are changing mode.
                if (zoneData.mode.slice (0, 6) == "boost_") {
                    // Remove "boost_" from mode string.
                    zoneData.mode = zoneData.mode.slice(6);
                }
                // Swap mode.
                zoneData.mode = (zoneData.mode == "timer") ? "man" : "timer";
                displayMode();
                displayStatus();
                // Flag we have made a change and re-display current status.
                zoneData.update = "pending";
                allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                // Fall through as all further operations same as cancel.
            case "control_cancel":
                // Move back to program selection keyboard.
                lastKeyboard.pop();
                switchToKeyboard (lastKeyboard.pop());
                // Display what is now the selected entry.
                displayProgramEntry (zoneData.timer_selected);
                // Clear the message now we're done.
                $("#bottom_line_left").text ("");
                break;
        }
    });
 
 
    /******************************************************************************* 
    * Function: updateServer ()
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
    
    function updateServer () {
        // Scan through all our zones.
        for (var zone in allZonesData) {
            //console.log ("ZONES",zone);
            // Has it been modified?
            if (allZonesData [zone]["update"] == "pending") {
                // Flag we sent it.
                allZonesData [zone]["update"] == "sent";

                // Update the server with the new zone data.
               // var sendMessage = {"command":"zone_update", "payload":allZonesData [zone]}
                socket.send (JSON.stringify ({"command":"zone_update", "payload":allZonesData [zone]}));
            }
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
    * Function: processProgrammingKeys (keyId, field)
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

    function processProgrammingKeys (keyId, field) {
        
        // Get the times that are displayed.
        var onTime = dataFieldOperation ("readOnAtDigits");
        var offTime = dataFieldOperation ("readOffAtDigits");
        var days = dataFieldOperation ("readDayDays");
        var selectedEntry = zoneData.timer_selected;
        
        switch (keyId) {
            case "control_confirm":
                // If 'on at' time > 'off at' time make them the same.
                if (onTime > offTime) {
                    // We need to find out if we were programming 'on at' or 'off at' times.
                    // This is so that we adjust the correct one. Do this by checking if
                    // either has the cursor.
                    if ($("#middle_line #on_at_digit_0").hasClass ("on_at_field_selected_cursor")) {
                        // Make off the same as on.
                        offTime = onTime;
                    } else if ($("#middle_line #off_at_digit_0").hasClass ("off_at_field_selected_cursor")){
                        // Make on the same as off.
                        onTime = offTime;
                    }
                }
                // Update on and off digits in display and then save. 
                dataFieldOperation ("updateOnAtDigits", onTime);
                dataFieldOperation ("updateOffAtDigits", offTime);
                saveProgramEntry (selectedEntry);
                // Tell user if it is valid and if it is set modified flag so we
                // send data to server when we are finished.
                if (checkIfValidTimes (selectedEntry) == true) {
                    // Flag we have made a change and re-display current status.
                    zoneData.update = "pending";
                    allZonesData [zoneData.zone] = JSON.parse (JSON.stringify (zoneData));
                }

                // Fall through to clean up the same as 'back'
            case "control_cancel":
                // Move back to last keyboard (program selection).
                lastKeyboard.pop();
                switchToKeyboard (lastKeyboard.pop());
                // Clear any highlighted fields.
                dataFieldOperation ("unHighlightOnAtDigits");
                dataFieldOperation ("unHighlightOffAtDigits");
                dataFieldOperation ("unHighlightDays");
                // Re-display the current program.
                displayProgramEntry (selectedEntry);
                // Clear any warning messages if it was the 'back' key as any
                // change will be discarded.
                if (keyId == "control_back") {
                    $("#bottom_line_left").text ("");
                }
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
    * Parameters:
    * 
    * Returns:
    * 
    * Globals modified:
    * 
    * Comments:
    * 
    ********************************************************************************/

    function processDayKey (keyId) {
        
        // Show 'confirm' key and set active now a key pressed.
        replaceKey ("key19", "confirm_key");
        if ($("#control_confirm").hasClass("btn-select")) {
            $("#control_confirm").toggleClass("btn-select btn_day_entry");
        }

        // Lookup for day info for each day key. This gives us the index
        // for the day field and the day letter.
        var dayInfo = {
            "day_mon":[0,"M"], "day_tue":[1,"T"], "day_wed":[2,"W"], "day_thu":[3,"T"],
            "day_fri":[4,"F"], "day_sat":[5,"S"], "day_sun":[6,"S"],
            "day_mon_fri":[0,1,2,3,4,"M","T","W","T","F"],
            "day_sat_sun":[5,6,"S","S"],
            "day_every_day":[0,1,2,3,4,5,6,"M","T","W","T","F","S","S"]
        };
        
        var startIndex = dayInfo[keyId][0];
        var numberOfFields = (dayInfo[keyId].length)/2;
        var fieldSet = false;
        var length = 0;
        
        // Scan through the required day fields.
        for (var index = startIndex; length < numberOfFields; length++, index++  ) {
            
            // Get the existing day field, it will either be a letter M,T,W,F,S or _.
            var currentDay =  $("#middle_line #days_day_" + index).text().trim();
            
            // If a field has no letter then set the letter and flag we have set one.
            if (currentDay == "_") {
               $("#middle_line #days_day_" + index).text(dayInfo[keyId][length + numberOfFields]);
               fieldSet = true;
            } 
        }
        length = 0;
        // If we didn't set a field then it (they) were already all set so clear it (them).
        if (fieldSet == false) {
           for (var index = startIndex; length < numberOfFields; length++, index++  ) {
               $("#middle_line #days_day_" + index).text("_");
           }
        }
    }
    

    /******************************************************************************* 
    * Function: processDigitKey (keyId, operation)
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

    function processDigitKey (keyId, operation) {

        // Lookup to get data required for each type of operation.
        var fieldInfo = {
            "inputOnAtDigit":
                {field:"on_at_", fieldType:"digit_", digitUpdate:"updateOnAtDigits", keyUpdate:"OnAt"},
            "inputOffAtDigit":
                {field:"off_at_", fieldType:"digit_", digitUpdate:"updateOffAtDigits", keyUpdate:"OffAt"}
        };
        // Get all the data for this operation into object.
        var op = fieldInfo[operation];
        
        // Find the current cursor location by looking for our cursor class.
        for (var digitIndex = 0; digitIndex < 5; digitIndex++) {
            // Create selector for location.
            var selectedDigit = op.field + op.fieldType + digitIndex; 
            // If we find the cursor exit.
            if ( $("#middle_line #" + selectedDigit).hasClass (op.field + "field_selected_cursor")) {
                break;
            }    
        }
        // If this is the 1st digit location clear the current entry.
        // Remove 'save' key. We will display it when all 4 digits entered.
        // Clear any warning message.
        if (digitIndex == 0) {
            dataFieldOperation (op.digitUpdate, "__:__");
            replaceKey ("key19", "blank_key");
            $("#bottom_line_left").text ("");
        }
        
        // Get the digit from the keyboard and put it at the cursor location.
        var digit = $("#current_keyboard #" + keyId).text();
        $("#middle_line #" + selectedDigit).text (digit);
        
        // Update cursor position and decide what to do depending where we are.
        digitIndex++;
        
        // If we're at the hours units we have to see what hours tens are and
        // only allow 0-3 if it is 2.
        if (digitIndex == 1) {
            if (digit == 2) {
                setActiveDigitKeys ("hoursUnits0To3" + op.keyUpdate);
            } else {
                setActiveDigitKeys ("allUnits" + op.keyUpdate);
            }
        
        // If we're at the colon move to tens of minutes and set 0-5 digits active.
        } else if (digitIndex == 2) {
            digitIndex++;
            setActiveDigitKeys ("minutesTens" + op.keyUpdate);
        
        // If we're at minutes units set all digits active.    
        } else if (digitIndex == 4) {
            setActiveDigitKeys ("allUnits" + op.keyUpdate);
        
        // If we're at the end wrap back to tens of hours and set 0-2 digits active.
        // Enable 'confirm' key.
        } else if (digitIndex > 4) {
            digitIndex = 0;
            setActiveDigitKeys ("hoursTens0To2" + op.keyUpdate);
            replaceKey ("key19", "confirm_key");
            if ($("#control_confirm").hasClass("btn-select")) {
                $("#control_confirm").toggleClass("btn-select btn_" + op.field + "entry");
            }
            // If the on time > off time warn user both times will be set the same.
            if (dataFieldOperation ("readOnAtDigits") > dataFieldOperation ("readOffAtDigits")){
                // Create and display warning message at bottom left of display.
                var warningMessage = "Warning: ";
                warningMessage += (op.field == "on_at_") ? "'off at time' " : "'on at time' ";
                warningMessage += "will be set to ";
                warningMessage += (op.field == "on_at_") ? "'on at time.'" : "'off at time'.";
                $("#bottom_line_left").text (warningMessage);
            }
        }
        
        // Create selector for next location.
        var nextSelectedDigit = op.field + op.fieldType + digitIndex; 
       
        // All further field accesses include 'field_selected' so add it.
        op.field += "field_selected";
                
        // Turn cursor off at this location.
        $("#middle_line #" + selectedDigit).toggleClass(op.field +"_cursor " + op.field);
        
        // Turn cursor on at next location
        $("#middle_line #" + nextSelectedDigit).toggleClass(op.field + "_cursor " + op.field);
        
    }


    /******************************************************************************* 
    * Function: dataFieldOperation (operation, fieldText)
    * 
    * Parameters: operation - specifies the operation to perform - highlight etc
    *             fieldText - text to load (if required).
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Highlights, un-highlights, updates the 'on at', 'off at' and 'days'
    * fields. Starts blinking of 1st digit.
    * 
    ********************************************************************************/
    
    function dataFieldOperation (operation, fieldText) {

        // Lookup to get data required for each type of operation.
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
        var selectedDigit;

        switch (op.action) {
            
            case "read":
                fieldText = "";
                // Copy the locations into feldText and return to caller.
                // Note: trim is used to remove unexplained leading spaces!
                for (var digitIndex = 0; digitIndex < op.digits; digitIndex++) {
                    selectedDigit = op.field + op.fieldType + digitIndex; 
                    fieldText += $("#middle_line #" + selectedDigit).text ().trim();
                }
                return (fieldText);

            case "update":
                // Copy the fieldText into the required locations.
                for (var digitIndex = 0; digitIndex < op.digits; digitIndex++) {
                    selectedDigit = op.field + op.fieldType + digitIndex; 
                    $("#middle_line #" + selectedDigit).text (fieldText [digitIndex]);
                }
                return ("");

            case "highlight":
                op.field += "field";
                // Highligtht the field and start 1st digit blinking for digits.
                $("#middle_line ." + op.field).toggleClass (op.field + " " + op.field + "_selected");
                if (op.fieldType == "digit_") {
                    $("#middle_line ." + op.field + "_selected:first").toggleClass (op.field + "_selected" + " " + op.field + "_selected_cursor");
                }
                return ("");
                
            case "unHighlight":
                op.field += "field";
                // Restore field to normal (no highlighting or blinking).
                $("#middle_line ." + op.field + "_selected_cursor").toggleClass (op.field + "_selected_cursor" + " " + op.field);
                $("#middle_line ." + op.field + "_selected").toggleClass (op.field + "_selected" + " " + op.field);
                return ("");
        }
    }
    
    /******************************************************************************* 
    * Function: setActiveDigitKeys (operation)
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
    function setActiveDigitKeys (operation){
        
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
        var op = fieldInfo[operation];

        
        // Scan through all the digits.
        for (var digit = 0; digit <= 9; digit++){
            // Clear back to basic button.
            $("#current_keyboard #digit_" + digit).removeClass("btn_digit  btn_" + op.field + "entry");
            // Do we need to make button active?
            if (digit <= op.maxDigit) {
                $("#current_keyboard #digit_" + digit).addClass("btn_" + op.field + "entry");
            } else {
                $("#current_keyboard #digit_" + digit).addClass("btn_digit");
            }
            
        }
    }
    
   
    /******************************************************************************* 
    * Function: controlProgramMan ()
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

    function controlProgramMan () {
        
        // Use time entry keyboard as base keyboard.
        switchToKeyboard ("time_entry_keyboard");
        
        // Add confirm and cancel keys.
        replaceKey ("key19", "confirm_key");
        replaceKey ("key20", "cancel_key");

        // Highlight 'confirm' and 'cancel' keys, use program/man class.
        $("#control_confirm").toggleClass("btn-select btn_confirm_cancel_program_man");
        $("#control_cancel").toggleClass("btn-select btn_confirm_cancel_program_man");
        
        // Reverse timer / manual mode.
        var newState = (zoneData.mode == "timer") ? "Manual mode" : "Timer Mode";

        // Display message.
        $("#bottom_line_left").text ("Set " + zoneData.name +
                                     " to " + newState + 
                                     "? - 'Confirm' or 'Cancel'");
    }


    /******************************************************************************* 
    * Function: controlDelete ()
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

    function controlDelete () {
        
        // Use time entry keyboard as base keyboard.
        switchToKeyboard ("time_entry_keyboard");
        
        // Add confirm and cancel keys.
        replaceKey ("key19", "confirm_key");
        replaceKey ("key20", "cancel_key");

        // Highlight 'confirm' and 'cancel' keys, use delete class.
        $("#control_confirm").toggleClass("btn-select btn_confirm_cancel_delete");
        $("#control_cancel").toggleClass("btn-select btn_confirm_cancel_delete");

        // Highlight the whole middle line.
        $("#middle_line_program > div").css("color", "red");
        
        // Display message.
        $("#bottom_line_left").text ("Delete timer " + 
                                     zoneData.timer_selected +
                                     "? - 'Confirm' or 'Cancel'");
    }


    /******************************************************************************* 
    * Function: controlDays ()
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

   function controlDays () {
       
        switchToKeyboard ("day_select_keyboard");
        
        // Change 'back' key to 'cancel' and highlight.
        replaceKey ("key20", "cancel_key");
        $("#control_cancel").toggleClass("btn-select btn_day_entry");

        // Highlight 'days' keys.
        $("#current_keyboard .btn_day").toggleClass("btn_day btn_day_entry");

        // Highlight 'days' text in display.
        dataFieldOperation ("highlightDays");
   }
   

    /******************************************************************************* 
    * Function: controlOnAt ()
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

    function controlOnAt () {
        //Move to time entry keyboard.
        switchToKeyboard ("time_entry_keyboard");
        
        // Change 'back' key to 'cancel' and highlight.
        replaceKey ("key20", "cancel_key");
        $("#control_cancel").toggleClass("btn-select btn_on_at_entry");

        // Start off with tens of hours valid keys (0,1,2)
        setActiveDigitKeys ("hoursTens0To2OnAt");
        
        // Highlight 'on at' text in display, sets cursor on digit 1.
        dataFieldOperation ("highlightOnAtDigits");
    }


    /******************************************************************************* 
    * Function: controlOffAt ()
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

    function controlOffAt () {
        //Move to time entry keyboard.
        switchToKeyboard ("time_entry_keyboard");
        
        // Change 'back' key to 'cancel' and highlight.
        replaceKey ("key20", "cancel_key");
        $("#control_cancel").toggleClass("btn-select btn_off_at_entry");

        // Start off with tens of hours valid keys (0,1,2)
        setActiveDigitKeys ("hoursTens0To2OffAt");
        
        // Highlight 'off at' text in display, sets cursor on digit 1.
        dataFieldOperation ("highlightOffAtDigits");
    }
        
    /******************************************************************************* 
    * Function: controlPreviousOrNext (id)
    * 
    * Parameters:
    * 
    * Returns:
    * 
    * Globals modified: zoneData.timer_selected
    * 
    * Comments:
    * 
    ********************************************************************************/

    function controlPreviousOrNext (id) {
        
        // Get current value of index to program entry.
        var selectedEntry = zoneData.timer_selected;

        // Check if previous or next key.
        if (id == "control_previous") {
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
        displayProgramEntry (selectedEntry);
    }
    
    /******************************************************************************* 
    * Function: saveProgramEntry (entry)
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

    function  saveProgramEntry (selectedEntry) {
        
        zoneData.timers [selectedEntry].on_at = dataFieldOperation ("readOnAtDigits");
        zoneData.timers [selectedEntry].off_at = dataFieldOperation ("readOffAtDigits");
        zoneData.timers [selectedEntry].days = dataFieldOperation ("readDayDays");
    }
    
    /******************************************************************************* 
    * Function: displayProgramEntry (selectedEntry)
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

    function  displayProgramEntry (selectedEntry) {
        
        // Clear the middle display line.
        $("#display_entries").text ("");
        $("#middle_line_program > div").text("");
        
        // If there are no entries tell the user.
        if (zoneData.timer_entries == 0) {
            $("#middle_line_program #status_text").text (zoneData.name +" has no timers - 'New' to create a timer");
            // Remove the 'on at', 'off at', 'days' and 'delete' keys.
            replaceKey ("key4", "blank_key");
            replaceKey ("key9", "blank_key");
            replaceKey ("key14", "blank_key");
            replaceKey ("key18", "blank_key");
        } else {
            $("#middle_line_program #turn_on_text").text ("Turn on at" + "\xa0");
            dataFieldOperation ("updateOnAtDigits", zoneData.timers [selectedEntry].on_at);
            $("#middle_line_program #turn_off_text").text ("\xa0" + "Turn off at" + "\xa0");
            dataFieldOperation ("updateOffAtDigits", zoneData.timers [selectedEntry].off_at);
            $("#middle_line_program #days_text").text ("\xa0" + "On days" + "\xa0");
            dataFieldOperation ("updateDaysDay", zoneData.timers [selectedEntry].days);
            
            // Tell user if it is valid.
            checkIfValidTimes (selectedEntry);
            
            // Display number of program entries on the right of the middle line.
            $("#display_entries").text ("(Timer " +
                                        selectedEntry + 
                                        " of " +
                                        zoneData.timer_entries +
                                        ")");
        }
        // Display previous and next keys as required.
        updatePreviousNextKeys ();
    }
    

    /******************************************************************************* 
    * Function: checkIfValidTimes (selectedEntry)
    * 
    * Parameters:
    * 
    * Returns: True if times are OK, else False.
    * 
    * Globals modified:
    * 
    * Comments:
    * 
    ********************************************************************************/

    function checkIfValidTimes (selectedEntry) {
        
        // Get the times for the currently selected timer.
        var onTime = zoneData.timers [selectedEntry].on_at;
        var offTime = zoneData.timers [selectedEntry].off_at;
        var days = zoneData.timers [selectedEntry].days;
        
        // If the on time = off time or there are no days warn user and exit false.
        if ((onTime == offTime) || (days == "_______")) {
            $("#bottom_line_left").text ("Warning: no on period.");
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
    * Function: displayMode ()
    * 
    * Parameters: None.
    * 
    * Returns: Nothing.
    * 
    * Globals modified: None.
    * 
    * Comments: Displays the current mode of the selected zone
    * 
    ********************************************************************************/

    function displayMode () {
        // Lookup for mode message in top left of display.
        var modeMessage = {"timer":" in Timer mode", "man":" in Manual mode",
                           "boost_timer":" in Timer mode", "boost_man":" in Manual mode",
                           "suspended":" in Timer mode"
        };
        // Create and display mode message at top left of display.
        $("#display_top1").text (zoneData.name + modeMessage[zoneData.mode]);
    }
    
    
    /******************************************************************************* 
    * Function: displayStatus ()
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
    
    function displayStatus () {
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
        
        //console.log(offTime, onTime);

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
            // If we are in timer or suspended mode there will be times to display.
            if ((zoneData.mode == "timer") || (zoneData.mode == "suspended")) {
                // If there are no entries tell the user.
                if (zoneData.timer_entries < 1) {
                    status += (zoneData.name +" has no timers");
                } else {
                    // Is this an 'on' or 'suspended'?
                    if (zoneData.zone_state == "on") {
                        // We are 'on' so set 'suspend' key active.
                        replaceKey ("key15", "suspend_key");
                        // We will display the next off time.
                        status += ("until " + offTime);
                        
                    } else if (zoneData.mode == "suspended") {
                        // We are 'suspended' so set 'resume' key active.
                        replaceKey ("key15", "resume_key");
                        // We will display the next on time.
                        status += ("until " + onTime);
                    
                    } else {
                        // We are timed off.  We will display the next on time.
                        status += ("until " + onTime);
                    }
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
//b1
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
        //console.log (lastKeyboard);
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

