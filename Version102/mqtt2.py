import paho.mqtt.client as mqttClient
import time
 
def on_connect(client, userdata, flags, rc):
 
    if rc == 0:
        print("Connected to broker")
        client.subscribe("hello/world/mk2018") 
    else:
        print("Connection failed")
 
def on_message(client, userdata, message):
    print "Message received: "  + message.payload
  
broker_address= "192.168.0.52"  #Broker address
 
client = mqttClient.Client("Python")               #create new instance
client.on_connect= on_connect                      #attach function to callback
client.on_message= on_message                      #attach function to callback
 
client.connect(broker_address)          #connect to broker
 
client.loop_start()        #start the loop

try:
    while True:
        time.sleep(1)
 
except KeyboardInterrupt:
    print "exiting"
    client.disconnect()
    client.loop_stop()
