var MAX_OTP = 16;
var otp_count = 0;
var theme = 0;
var timezoneOffset = 0;
var message_send_retries = 0;
var message_send_max_retries = 5;
var app_version = 2;
var debug = false;

function loadLocalVariables() {
	otp_count = parseInt(localStorage.getItem("otp_count"));
	theme = parseInt(localStorage.getItem("theme"));
	timezoneOffset = new Date().getTimezoneOffset();
}

function sendAppMessage(data) {
	Pebble.sendAppMessage(data,
						function(e) { // SUCCESS
							if (debug)
								console.log("Successfully delivered message with transactionId=" + e.data.transactionId);
							message_send_retries = 0;
						}, function(e) { // FAILURE
							if (debug)
								console.log("Unable to deliver message with transactionId=" + e.data.transactionId + " Error is: " + e.error.message);
							if (message_send_retries <= message_send_max_retries) {
								message_send_retries++;
								if (debug)
									console.log("Retry: " + message_send_retries);
								sendAppMessage(data);
							} else {
								if (debug)
									console.log("All retries failed");
								message_send_retries = 0;
							}
						});
}

Pebble.addEventListener("ready",
							function(e) {
								if (debug)
									console.log("JavaScript app ready and running!");

								// localStorage should only be accessed are the "ready" event is fired
								loadLocalVariables();
								
								// Send timezone, keycount, and theme to watch
								sendAppMessage({"key_count":otp_count, "theme":theme, "timezone":timezoneOffset});

								if (debug) {
									console.log("otp_count="+otp_count);
									console.log("theme="+theme);
									console.log("timezoneOffset="+timezoneOffset);
								}
							}
						);

function sendKeyToWatch(secret) {
	sendAppMessage({"transmit_key":secret});
}

function confirmDelete(secret) {
	var blnFound = false;
	for (var i = 0; i < MAX_OTP;i++) {
		var savedSecret = localStorage.getItem('secret_pair'+i);
		
		if (savedSecret !== null && savedSecret.indexOf(secret) != -1)
			blnFound = true;
		
		if (blnFound) {
			var nextSecret = localStorage.getItem('secret_pair'+(i+1));
			if (nextSecret)
				localStorage.setItem('secret_pair'+i,nextSecret);
			else
				localStorage.removeItem('secret_pair'+i);
		}
	}
	otp_count--;
	localStorage.setItem("otp_count",otp_count);
	sendAppMessage({"delete_key":secret});
}

// Set callback for appmessage events
Pebble.addEventListener("appmessage",
							function(e) {
								if (debug)
									console.log("Message Recieved");
								if (e.payload.request_key) {
									if (debug)
										console.log("Requested key: "+e.payload.request_key);
									sendKeyToWatch(localStorage.getItem("secret_pair"+(e.payload.request_key-1)));
								}
								else if (e.payload.delete_key) {
									if (debug)
										console.log("Deleting key: "+e.payload.delete_key);
									confirmDelete(e.payload.delete_key);
								}
								else {
									if (debug)
										console.log(e.payload);
								}
							});

Pebble.addEventListener('showConfiguration', function(e) {
	var url = 'http://oncloudvirtual.com/pebble/pebbleauth/?version='+app_version+'&otp_count='+otp_count;
	if (debug)
		console.log(url);
	Pebble.openURL(url);
});

Pebble.addEventListener("webviewclosed",
							function(e) {
								var configuration = JSON.parse(e.response);
								var config ={};
								
								if(!isNaN(configuration.theme) && configuration.theme != theme) {
									if (debug)
										console.log("Theme changed");
									
									theme = configuration.theme;
									localStorage.setItem("theme",theme);
									config.theme = theme;
								}

								if(configuration.label && configuration.secret) {
									var secret = configuration.secret.replace(/0/g,"O").replace(/1/g, "I").replace(/\+/g, '').replace(/\s/g, '').toUpperCase();
									var secretPair = configuration.label + ":" + secret;
									
									var blnKeyExists = false;
									for (var i=0;i<otp_count;i++) {
										var savedSecret = localStorage.getItem('secret_pair'+i);
										if (savedSecret !== null && savedSecret.indexOf(secret) != -1) {
											if (debug)
												console.log("Relabled code");
											
											blnKeyExists = true;
											localStorage.setItem('secret_pair'+i,secretPair);
											config.transmit_key = secretPair;
										}
									}
									if(!blnKeyExists && otp_count < MAX_OTP) {
										if (debug)
											console.log("Uploading new key:"+secretPair);
										
										localStorage.setItem('secret_pair'+otp_count,secretPair);
										otp_count++;
										localStorage.setItem("otp_count",otp_count);
										config.transmit_key = secretPair;
									}
									else if (blnKeyExists) {
										if (debug)
											console.log("Code exists, updating label");
									}
									else if (otp_count >= MAX_OTP) {
										if (debug)
											console.log("Too many codes..."+otp_count);
									}
								}
								if (debug)
									console.log("Uploading config");
								sendAppMessage(config);
							}
						);