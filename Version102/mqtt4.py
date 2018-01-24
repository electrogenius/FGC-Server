import paho.mqtt.client as mqttClient
import time
 
def on_connect(client, userdata, flags, rc):
 
    if rc == 0:
        print("Connected to broker")
    else:
        print("Connection failed")
 
client = mqttClient.Client("Python")               #create new instance
client.on_connect= on_connect                      #attach function to callback

print ("Connecting...")
client.loop_start()        #start the loop

client.connect("192.168.0.244")          #connect to broker
time.sleep(1.9)
 
client.publish("hello/world/mk2018","testing 7")
 
time.sleep(1.9)
 
print "exiting"
client.loop_stop()
client.disconnect()
