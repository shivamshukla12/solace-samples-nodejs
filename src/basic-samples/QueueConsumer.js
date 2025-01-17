/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Solace Systems Node.js API
 * Persistence with Queues tutorial - Queue Consumer
 * Demonstrates receiving persistent messages from a queue
 */

/*jslint es6 node:true devel:true*/

var QueueConsumer = function (solaceModule, queueName) {
  "use strict";
  const { PerformanceObserver, performance } = require("perf_hooks");
  var util = require("util");
  var hana = require("@sap/hana-client");
  let values = [];
  var solace = solaceModule;
  var consumer = {};
  consumer.session = null;
  consumer.queueName = "FEDEX_TRACKING"; //queueName;
  consumer.consuming = false;

  // Logger
  consumer.log = function (line) {
    var now = new Date();
    var time = [
      ("0" + now.getHours()).slice(-2),
      ("0" + now.getMinutes()).slice(-2),
      ("0" + now.getSeconds()).slice(-2),
    ];
    var timestamp = "[" + time.join(":") + "] ";
    console.log(timestamp + line);
  };

  consumer.log(
    '\n*** Consumer to queue "' +
      consumer.queueName +
      '" is ready to connect ***'
  );

  // main function
  consumer.run = function (argv) {
    consumer.connect(argv);
  };

  // Establishes connection to Solace message router
  consumer.connect = function (argv) {
    if (consumer.session !== null) {
      consumer.log("Already connected and ready to consume messages.");
      return;
    }
    // extract params
    if (argv.length < 2 + 3) {
      // expecting 3 real arguments
      consumer.log(
        "Cannot connect: expecting all arguments" +
          " <protocol://host[:port]> <client-username>@<message-vpn> <client-password>.\n" +
          "Available protocols are ws://, wss://, http://, https://, tcp://, tcps://"
      );
      process.exit();
    }
    var hosturl = argv.slice(2)[0];
    consumer.log("Connecting to Solace message router using url: " + hosturl);
    var usernamevpn = argv.slice(3)[0];
    var username = usernamevpn.split("@")[0];
    consumer.log("Client username: " + username);
    var vpn = usernamevpn.split("@")[1];
    consumer.log("Solace message router VPN name: " + vpn);
    var pass = argv.slice(4)[0];
    // create session
    try {
      consumer.session = solace.SolclientFactory.createSession({
        // solace.SessionProperties
        url: hosturl,
        vpnName: vpn,
        userName: username,
        password: pass,
      });
    } catch (error) {
      consumer.log(error.toString());
    }
    // define session event listeners
    consumer.session.on(
      solace.SessionEventCode.UP_NOTICE,
      function (sessionEvent) {
        consumer.log(
          "=== Successfully connected and ready to start the message consumer. ==="
        );
        consumer.startConsume();
      }
    );
    consumer.session.on(
      solace.SessionEventCode.CONNECT_FAILED_ERROR,
      function (sessionEvent) {
        consumer.log(
          "Connection failed to the message router: " +
            sessionEvent.infoStr +
            " - check correct parameter values and connectivity!"
        );
      }
    );
    consumer.session.on(
      solace.SessionEventCode.DISCONNECTED,
      function (sessionEvent) {
        consumer.log("Disconnected.");
        consumer.consuming = false;
        if (consumer.session !== null) {
          consumer.session.dispose();
          consumer.session = null;
        }
      }
    );
    // connect the session
    try {
      consumer.session.connect();
    } catch (error) {
      consumer.log(error.toString());
    }
  };

  // Starts consuming from a queue on Solace message router
  consumer.startConsume = function () {
    if (consumer.session !== null) {
      if (consumer.consuming) {
        consumer.log(
          'Already started consumer for queue "' +
            consumer.queueName +
            '" and ready to receive messages.'
        );
      } else {
        consumer.log("Starting consumer for queue: " + consumer.queueName);
        try {
          // Create a message consumer
          consumer.messageConsumer = consumer.session.createMessageConsumer({
            // solace.MessageConsumerProperties
            queueDescriptor: {
              name: consumer.queueName,
              type: solace.QueueType.QUEUE,
            },
            acknowledgeMode: solace.MessageConsumerAcknowledgeMode.CLIENT, // Enabling Client ack
          });
          // Define message consumer event listeners
          consumer.messageConsumer.on(
            solace.MessageConsumerEventName.UP,
            function () {
              consumer.consuming = true;
              consumer.log("=== Ready to receive messages. ===");
            }
          );
          consumer.messageConsumer.on(
            solace.MessageConsumerEventName.CONNECT_FAILED_ERROR,
            function () {
              consumer.consuming = false;
              consumer.log(
                '=== Error: the message consumer could not bind to queue "' +
                  consumer.queueName +
                  '" ===\n   Ensure this queue exists on the message router vpn'
              );
            }
          );
          consumer.extractResponseMessageObj = function (oBinaryString) {
            let a = oBinaryString.trim();
            let b = a.replaceAll("\x00", "");
            let c = b.replace("\x1F", "");
            let d = c.slice(1);
            let e = JSON.parse(d);
            return e;
          };
          consumer.messageConsumer.on(
            solace.MessageConsumerEventName.DOWN,
            function () {
              consumer.consuming = false;
              consumer.log("=== The message consumer is now down ===");
            }
          );
          consumer.messageConsumer.on(
            solace.MessageConsumerEventName.DOWN_ERROR,
            function () {
              consumer.consuming = false;
              consumer.log(
                "=== An error happened, the message consumer is down ==="
              );
            }
          );
          // Define message received event listener
          consumer.messageConsumer.on(
            solace.MessageConsumerEventName.MESSAGE,
            function (message) {
              consumer.log(
                'Received message: "' +
                  message.getBinaryAttachment() +
                  '",' +
                  " details:\n" +
                  message.timestamp
              );
              var aMessagesConsume = [];
              let oMessage = message.getBinaryAttachment();
              let oResponseObj = consumer.extractResponseMessageObj(oMessage);
              aMessagesConsume.push(oResponseObj);
              let shipno = oResponseObj["Shipno"];
              let text = oResponseObj["Text"];
              let loc = oResponseObj["Location"];
              let stat = oResponseObj["Status"];
              let lat = oResponseObj["Lattitude"];
              let long = oResponseObj["Longitude"];
              message.acknowledge();
              var connOptions = {
                serverNode:
                  "e3a8e848-d48f-472d-91e9-555d630aff17.hana.trial-us10.hanacloud.ondemand.com:443",
                UID: "DBADMIN",
                PWD: "sparta@123A",
              };
              let sql = `insert into FEDEX_SHIP (shipno,Text,location,Status,lattitude,longitude) values`;
              var connection = hana.createConnection();
              connection.connect(connOptions);
              var t0 = performance.now();
              sql = `${sql}('${shipno}','${text}','${loc}','${stat}','${lat}','${long}')`;
              sql = sql + ";";
              var result = "";
              var result = connection.exec(sql);
              console.log(sql);
              console.log(util.inspect(result, { colors: false }));
              var t1 = performance.now();
              console.log("time in ms " + (t1 - t0));
              connection.disconnect();
            }
          );
          // Connect the message consumer
          consumer.messageConsumer.connect();
        } catch (error) {
          consumer.log(error.toString());
        }
      }
    } else {
      consumer.log(
        "Cannot start the queue consumer because not connected to Solace message router."
      );
    }
  };

  consumer.exit = function () {
    consumer.stopConsume();
    consumer.disconnect();
    setTimeout(function () {
      process.exit();
    }, 1000); // wait for 1 second to finish
  };

  // Disconnects the consumer from queue on Solace message router
  consumer.stopConsume = function () {
    if (consumer.session !== null) {
      if (consumer.consuming) {
        consumer.consuming = false;
        consumer.log(
          "Disconnecting consumption from queue: " + consumer.queueName
        );
        try {
          consumer.messageConsumer.disconnect();
          consumer.messageConsumer.dispose();
        } catch (error) {
          consumer.log(error.toString());
        }
      } else {
        consumer.log(
          'Cannot disconnect the consumer because it is not connected to queue "' +
            consumer.queueName +
            '"'
        );
      }
    } else {
      consumer.log(
        "Cannot disconnect the consumer because not connected to Solace message router."
      );
    }
  };

  // Gracefully disconnects from Solace message router
  consumer.disconnect = function () {
    consumer.log("Disconnecting from Solace message router...");
    if (consumer.session !== null) {
      try {
        consumer.session.disconnect();
      } catch (error) {
        consumer.log(error.toString());
      }
    } else {
      consumer.log("Not connected to Solace message router.");
    }
  };

  return consumer;
};

var solace = require("solclientjs").debug; // logging supported

// Initialize factory with the most recent API defaults
var factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);

// enable logging to JavaScript console at WARN level
// NOTICE: works only with ('solclientjs').debug
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

// create the consumer, specifying the name of the queue
var consumer = new QueueConsumer(solace, "FEDEX_TRACKING");

// subscribe to messages on Solace message router
consumer.run(process.argv);

// wait to be told to exit
consumer.log("Press Ctrl-C to exit");
process.stdin.resume();

process.on("SIGINT", function () {
  "use strict";
  consumer.exit();
});
