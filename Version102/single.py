import paho.mqtt.publish as publish
publish.single("hello/world/mk2018", '{"zone":0}',hostname="192.168.0.52")

