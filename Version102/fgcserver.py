from flask import Flask, render_template, request
from flask_socketio import SocketIO, send
from copy import deepcopy
from threading import Lock
import json
import os
import time

# This is the skeleton for data we keep for each zone. We do not use a class as we want
# to be able to convert the zone data to json to send to the browser.
# Fields can have the following values:
# "zone" - "zone0" to "zone30" - The hardware zone number.
# "command" - "zone_request", "zone_reply" - client requests, server replies.
# "update" - "completed", "pending", "sent".
# "name" - the name of the room as defined in zoneNames.
# "mode" - "man", "timer", "boost_man", "boost_man", "suspended"
# "boost"- "none" or the boost end time as "HH:MM DDD".
# "zone_state" - "unknown", "on", "off".
# "next_off_time" - UTC - the time the current on or off will end.
# "next_on_time" - UTC - the next off or on time.
# "boost_off_time" - UTC - the boost off time.

basicZoneData = {
    "zone":"",
    "command":"zone_reply",
    "update": "completed",
    "debug_text":"",
    "name":"",
    "mode":"man",
    "zone_state":"off",
    "next_on_time":0,
    "next_off_time":0,
    "boost_off_time":0,
    "timer_entries":0,
    "timer_selected":0,
    "timer_active":0,
    "timers":[{}],
}

# Lookup defining each zone number to a room name. Zone0 is reserved for debug use.
zoneNames = {
    "zone0":"",
    "zone1":"Rad Bed 1", "zone2":"Rad Bed 2", "zone3":"Rad Bed 3", "zone4":"Rad Bed 4",
    "zone5":"Rad Bed 5", "zone6":"Rad Bath 1", "zone7":"Rad Bath 2", "zone8":"Rad Bath 3-4",
    "zone9":"Rad Hall Up", "zone10":"Rad Kitchen", "zone11":"Rad Dining", "zone12":"Rad Library",
    "zone13":"Rad Cloak", "zone14":"Rad Sitting",
    "zone15":"Ufh Bed 1", "zone16":"Ufh Bed 2", "zone17":"Ufh Bed 3", "zone18":"Ufh Bed 4",
    "zone19":"Ufh Bed 5", "zone20":"Ufh Bath 1", "zone21":"Ufh Bath 2", "zone22":"Ufh Bath 3-4",
    "zone23":"Ufh Hall Up", "zone24":"Ufh Kitchen", "zone25":"Ufh Dining", "zone26":"Ufh Library",
    "zone27":"Ufh Hall Down", "zone28":"Ufh Cloak", "zone29":"Ufh Sitting", "zone30":"Ufh Sitting X"
}

# We will keep the data for all the zones here.
allZonesData = {}


app = Flask (__name__ )
#app.config['SECRET_KEY'] = 'mysecret'
socketio = SocketIO (app)
#thread = None
zoneDataLock = Lock ()

# Need to do this as cloud 9 gives wrong time otherwise.
#os.environ ['TZ'] = "Europe/London"
#time.tzset()


################################################################################
#
# Function: checkTimedZone ()
#
# Parameters:
#
# Returns:
#
# Globals modified:
#
# Comments: 
#
################################################################################

def checkTimedZone (zoneData):

    # Function to create a UTC entry for next_on_time and next_off_time.
    def CreateUtcEntry (currentDateTime, newTime, dayAdvance) :
        
        # Need the current time as a list for modification.
        nextTime = list (currentDateTime)
        # Set new hour.
        nextTime [3] = int (newTime [0:2])
        # Set new minute.
        nextTime [4] = int (newTime [3:5])
        # Zero seconds.
        nextTime [5] = 0

        # Add the number of days from now and return to caller.
        return time.mktime (nextTime) + dayAdvance
    

    # Get current time in the text format that we use for timers.
    localTime = time.localtime (time.time ())
    currentTime = str (localTime.tm_hour ).zfill(2) + ":" + str (localTime.tm_min).zfill(2)
    
    mode = zoneData ["mode"]
    numberOfTimers = zoneData ["timer_entries"]
    timerData = deepcopy (zoneData ["timers"])
    
    # Is timer mode active and are there any timers for this zone?
    # mode may be "suspended" which can only occur if we were on and in
    # "timer" mode.
    if mode in ("timer", "suspended") and numberOfTimers > 0:

        # Clear active timer flag as default.
        zoneData ["timer_active"] = 0  
        # Set zone off as default.
        zoneData ["zone_state"] = "off"
        # Make a list of all the timers.
        allTimersList = list (range (1, numberOfTimers + 1))
        
        # Check each timer and if it is valid for today save it in a list.
        todayTimersList = []
        for timer in allTimersList :
            if  timerData [timer]["days"][localTime.tm_wday] != "_" :
                todayTimersList.append (timer)
        
        # Are any timers valid for today?
        if todayTimersList :
            # Now we will check if any timer is fully within another timer. If
            # it is we will remove it from the timer list as the outer timer will
            # define the on period.
            withinTimersList = []
            for timer in todayTimersList :
                # Only process timers we have NOT removed.
                if timer not in withinTimersList :
                    # Get on and off times for this timer.
                    timerOnAt = timerData [timer]["on_at"]
                    timerOffAt = timerData [timer]["off_at"]
                    # Make a new list of the timers, but exclude this one.
                    tempTimerList = deepcopy (todayTimersList)
                    tempTimerList.remove (timer)
                    # Scan through timers to see if we have any within this one.
                    for tempTimer in tempTimerList :
                        tempTimerOnAt = timerData [tempTimer]["on_at"]
                        tempTimerOffAt = timerData [tempTimer]["off_at"]
                        # Does start and end time fall within this timer's period?
                        if tempTimerOnAt >= timerOnAt and tempTimerOffAt <= timerOffAt :
                            # Timer is within so remember it. Make sure we only save it once.
                            if tempTimer not in withinTimersList :
                                withinTimersList.append (tempTimer)
            
            # Now remove any within timers from our timer list.
            for withinTimer in withinTimersList :
                todayTimersList.remove (withinTimer)
            
            # Sort timers according to off at time. We do this for overlapping
            # and consecutive test below.
            todayTimersList.sort (key=lambda timerNumber:timerData [timerNumber]['off_at'])
            
            # Check each timer to see if current time is within timer.
            for timer in todayTimersList :
                # Get data for this timer.
                timerOnAt = timerData [timer]["on_at"]
                timerOffAt = timerData [timer]["off_at"]
                # Is current time within timer period?
                if timerOnAt <= currentTime < timerOffAt :
                    # Current time is within timer so zone is on.
                    # We need to set the until time with the timer off time.
                    # If we have overlapping or consecutive timers the off time
                    # may be later than the current timer so we will check for
                    # this.
                    # Make a new list of the timers, but exclude this one.
                    tempTimerList = deepcopy (todayTimersList)
                    tempTimerList.remove (timer)
                    # Scan through timers to see if overlapping or consecutive.
                    # Timers are sorted for "off at" so we are working through
                    # them in the correct order.
                    for tempTimer in tempTimerList :
                        # Get data for this timer.
                        tempTimerOnAt = timerData [tempTimer]["on_at"]
                        tempTimerOffAt = timerData [tempTimer]["off_at"]
                        # Does start time fall within this timer's period?
                        if timerOnAt <= tempTimerOnAt <= timerOffAt :
                            # If it does then use the off time.
                            timerOffAt = tempTimerOffAt
                    
                    # Get here with off time set to end of total period.
                    zoneData ["next_off_time"] = CreateUtcEntry (localTime, timerOffAt, 0 )
                    # Set active timer flag.
                    zoneData ["timer_active"] = timer  
                    # If we are "suspended" we will leave zone off.
                    if mode != "suspended":
                        # Set zone on.
                        zoneData ["zone_state"] = "on"
                    # Now leave as we are within a timer and we have set the
                    # off time to the last of any overlapping timers.
                    break
        
        # We always get the next on time. This will either be the next on if
        # we are timed off or the next on if we are timed on. The latter is
        # required so that if a suspend is set we have the following on time
        # to display.

        # Sort timer lists according to "on at" time. We do this as we
        # are looking for next "on at" below.
        allTimersList.sort (key=lambda timerNumber:timerData [timerNumber]['on_at'])
        todayTimersList.sort (key=lambda timerNumber:timerData [timerNumber]['on_at'])
    
        # Check each timer to see if we have an "on at" later today.
        for timer in todayTimersList :
            # Get on time for this timer.
            timerOnAt = timerData [timer]["on_at"]
            # Have we got a "on at" time after current time?
            if timerOnAt > currentTime :
                # We have a time today so use it as on time.
                zoneData ["next_on_time"] = CreateUtcEntry (localTime, timerOnAt, 0)
                # Got an on time so leave.    
                break
        else:
            # Get here if no timer "on at" later today. We need to check
            # through each day until we find the next "on at".
            dayAdvance = 0
            # Get current day.
            dayOfWeek = localTime.tm_wday

            while allTimersList :
                # Move to next day. Wrap if we move past Sunday (6).
                dayOfWeek = dayOfWeek + 1 if dayOfWeek < 6 else 0
                # Each time we go forward one day we will add 86400 seconds
                # to the UTC time.
                dayAdvance += 86400

                # Check each timer and if it is valid for the day we have
                # the next "on at" time.
                for timer in allTimersList :
                    # Get on time for this timer.
                    timerOnAt = timerData [timer]["on_at"]
                    # Is timer valid for this day?
                    if  timerData [timer]["days"][dayOfWeek] != "_" :
                        # We have a valid day so use on time.
                        zoneData ["next_on_time"] = CreateUtcEntry (localTime, timerOnAt, dayAdvance )
                        # Clear timer list so we drop out of outer loop.
                        allTimersList = []
                        # Got an on time so leave.   
                        break
                    
    # Now we are finished with a zone we exit. Because we were passed zoneData by
    # reference we have updated the original data.
    return zoneData


################################################################################
#
# Function: checkForBoostZones ()
#
# Parameters:
#
# Returns:
#
# Globals modified:
#
# Comments: 
#
################################################################################

def checkForBoostZones ():
    
    # Get current time and day in the UTC format that we use for until time.
    currentTime = time.time ()

    # Check each zone.
    for zoneNumber in allZonesData :
        zoneMode = allZonesData [zoneNumber]["mode"]
        # Is boost active?
        if zoneMode [0:6] == "boost_" :
            # Boost is active. Get boost end for this zone.
            boostEnd = allZonesData [zoneNumber]["boost_off_time"]
            # Do we have a boost end time match?
            if (currentTime >= boostEnd):
                # Boost is finished so clear boost mode by removing "boost_"
                # from mode string.
                allZonesData [zoneNumber]["mode"] = zoneMode [6:]


################################################################################
#
# Function: sendZoneStates ()
#
# Parameters:
#
# Returns:
#
# Globals modified:
#
# Comments: 
#
################################################################################

def sendZoneStates ():

    # We will save all the zone states here.
    zoneStates = {}
    # Scan through each zone and save the state (on or off).
    for zoneNumber in allZonesData :
        zoneStates [zoneNumber] = {"zone_state":allZonesData [zoneNumber]["zone_state"]}

    # Now send to client.
    send (json.dumps ({"command":"zone_states", "payload":zoneStates}))


################################################################################
#
# Function: checkZonesThread ()
#
# Parameters:
#
# Returns:
#
# Globals modified:
#
# Comments: 
#
################################################################################

def checkZonesThread ():
    
    while True:
        # We will do a check about every second.
        socketio.sleep (1)
        # We mustn't alter data if other thread is using it.
        with zoneDataLock :
            #  We check boost 1st as it overrides timers.
            checkForBoostZones ()
            # Now check for timed zones.
            for zoneNumber in allZonesData :
                # Note allZonesData passed by reference so it is modified by
                # checkTimedZone.
                checkTimedZone (allZonesData [zoneNumber])


def sendConsoleMessage (message) :
    send (json.dumps ({"command":"console_message", "payload":message}))



                
################################################################################
#
# Function: loadZones ()
#
# Parameters: None
#
# Returns: Nothing
#
# Globals modified: allZonesData
#
# Comments:  Whenever we restart we will check if we have a file for each zone.
# If we have, we will read the data in. If not, we will create an entry of basic
# zone data.
#
################################################################################

def loadZones ():
    # Use our lookup to scan through all defined zones.
    for zoneNumber in zoneNames :
        
        # Check to see if file is present.
        try:
            zoneFile = open ("zonetimes/" + zoneNumber, "r")
        
        # If file is not present create it. Put a new entry in allZonesData and
        # save it to the file in json format.
        except IOError:
            zoneFile = open ("zonetimes/" + zoneNumber, "w")
            allZonesData [zoneNumber] = deepcopy (basicZoneData)
            allZonesData [zoneNumber]["zone"] = zoneNumber
            allZonesData [zoneNumber]["name"] = zoneNames [zoneNumber]
            zoneFile.write (json.dumps (allZonesData [zoneNumber]))
            zoneFile.close () 
        
        # If the file is present we read it into allZonesData.    
        else:
            allZonesData [zoneNumber] = json.loads (zoneFile.read ())
            zoneFile.close ()
            

################################################################################
#
# Function: handleMessage()
#
# Parameters:
#
# Returns:
#
# Globals modified:
#
# Comments: 
#
################################################################################

@socketio.on('message')
def handleMessage(msg):
    global allZonesData
    # We mustn't alter data if another thread is using it.
    with zoneDataLock :
        msg = json.loads (msg)
        sendConsoleMessage (msg)
        if (msg ["command"] == "zone_data_request") :
            zone = msg ["payload"]["zone"]
            send (json.dumps ({"command":"zone_reply", "payload":allZonesData [zone]}))
    
        elif (msg ["command"] == "zone_update") :
            zone = msg ["payload"]["zone"] 
            allZonesData [zone] = deepcopy(msg ["payload"])
            allZonesData [zone]["update"] = "completed"
            print allZonesData [zone]
            zoneFile = open ("zonetimes/" + zone, "w")
            zoneFile.write (json.dumps (allZonesData [zone]))     
            zoneFile.close ()

        elif (msg ["command"] == "zone_check") :
            checkTimedZone (msg ["payload"])
            send (json.dumps ({"command":"zone_reply", "payload":msg ["payload"]}))
        
        elif (msg ["command"] == "zone_state_request") :
            sendZoneStates ()
        
 
@app.route("/")
def hello():
   return render_template("fgcserver.html")
 
if __name__ == "__main__":
    # Read all the zone files into allZonesData. 
    loadZones ()
    # When we have all the zone data start task to check for zone operation.
    socketio.start_background_task (target = checkZonesThread)     
    #app.run(host='0.0.0.0', port=80, debug=True) 
    socketio.run(app, host='0.0.0.0', port=80, debug=True)
   
   
   
################################################################################     
#
# Function: 
#
# Parameters:
#
# Returns:
#
# Globals modified:
#
# Comments: 
#
################################################################################
