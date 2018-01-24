#import paho.mqtt.client as mqtt
import paho.mqtt.publish as publish
#import time
# This is the Publisher
publish.single("hello/world/mk2018", "Big python",hostname="192.168.0.52")
#publish.single("hello/world/mk2018", "Small python",hostname="192.168.0.52")

#client = mqtt.Client()
#client.connect("192.168.0.52",1883,60)
#time.sleep (5)
#client.publish("hello/world/mk2018", "Hello world from big python")
#client.disconnect()
