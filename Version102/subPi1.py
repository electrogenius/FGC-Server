import time
import json
import paho.mqtt.client as mqttClient
#import RPi.GPIO as GPIO

#/GPIO.setmode(GPIO.BCM)
#GPIO.setup(18, GPIO.OUT)
#GPIO.setup(23, GPIO.OUT)

def on_connect(client, userdata, flags, rc):
 
    if rc == 0:
        print("Connected to broker from pi")
        client.subscribe("hello/world/mk2018") 
    else:
        print("Connection failed")
 
def on_message(client, userdata, message):
    print "Message received: "  + message.payload
    restoredData = json.loads (message.payload)
    print 'Restored:',restoredData

    if restoredData["zone"] == 0:
        print ("ON")
       # GPIO.output (23,0)
    else:
        print ("OFF")
       # GPIO.output (23,1)

brokerAddress = "192.168.0.52"  
 
client = mqttClient.Client("WIN")               #create new instance
client.on_connect = on_connect
client.on_message= on_message
client.connect(brokerAddress) 
client.loop_start ()

try:
    while True:
        time.sleep(1)
 
except KeyboardInterrupt:
    print "exiting"
    client.disconnect()
    client.loop_stop()
