import paho.mqtt.client as mqttClient
import time
 
def on_connect(client, userdata, flags, rc):
 
    if rc == 0:
        print("Connected to broker")
        client.publish("hello/world/mk2018","testing again twice")
    else:
        print("Connection failed")
 
def on_message(client, userdata, message):
    print "Message received: "  + message.payload
 
 
 
client = mqttClient.Client("Python")               #create new instance
client.on_connect= on_connect                      #attach function to callback
client.on_message= on_message                      #attach function to callback

print ("Connecting...")
client.loop_start()        #start the loop

client.connect("192.168.0.52")          #connect to broker
while 1:
    time.sleep(1)
 
#client.publish("hello/world/mk2018","testing again twice")
 
#time.sleep(1)
 
#print "exiting"
#client.loop_stop()
client.disconnect()
