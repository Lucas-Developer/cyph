var authors							= {me: 1, friend: 2, app: 3};
var preConnectMessageReceiveQueue	= [];
var preConnectMessageSendQueue		= [];
var otrWorkerOnMessageQueue			= [];

var isAlive				= false;
var shouldUseOldChannel	= false;

var CHANNEL_DATA_PREFIX		= 'CHANNEL DATA: ';
var CHANNEL_RATCHET_PREFIX	= 'CHANNEL RATCHET: ';
var WEBRTC_DATA_PREFIX		= 'WEBRTC: ';

var SECRET_LENGTH		= 7;
var LONG_SECRET_LENGTH	= 52;

var channelDataMisc	= {
	connect: '1',
	ping: '2',
	pong: '3',
	imtypingyo: '4',
	donetyping: '5'
};

var
	channel,
	oldChannel,
	isWebSignObsolete,
	isConnected,
	isOtrReady,
	hasKeyExchangeBegun,
	lastIncomingMessageTimestamp,
	lastOutgoingMessageTimestamp,
	cyphId,
	sharedSecret,
	shouldStartNewCyph,
	shouldSendQueryMessage
;


/* Init cyph */

var otrWorker		= makeWorker(cryptoWebWorker);

otrWorker.onmessage	= function (e) { otrWorkerOnMessageQueue.push(e) };

var otr	= {
	sendQueryMsg: function () {
		if (isOtrReady) {
			otrWorker.postMessage({method: 1});
		}
		else {
			shouldSendQueryMessage	= true;
		}
	},
	sendMsg: function (message) {
		if (isConnected) {
			otrWorker.postMessage({method: 2, message: message});
		}
		else {
			preConnectMessageSendQueue.push(message);
		}
	},
	receiveMsg: function (message) {
		if (isOtrReady) {
			otrWorker.postMessage({method: 3, message: message});
		}
		else {
			preConnectMessageReceiveQueue.push(message);
		}
	}
};


function otrWorkerOnMessageHandler (e) {
	switch (e.data.eventName) {
		case 'ui':
			if (e.data.message) {
				var channelDataSplit	= e.data.message.split(CHANNEL_DATA_PREFIX);

				if (!channelDataSplit[0] && channelDataSplit[1]) {
					receiveChannelData(JSON.parse(channelDataSplit[1]));
				}
				else {
					addMessageToChat(e.data.message, authors.friend);
				}
			}
			break;

		case 'io':
			sendChannelDataBase({Message: e.data.message});
			logCyphertext(e.data.message, authors.me);
			break;

		case 'ready':
			isOtrReady	= true;

			if (shouldSendQueryMessage) {
				otr.sendQueryMsg();
			}

			while (preConnectMessageReceiveQueue.length) {
				otr.receiveMsg(preConnectMessageReceiveQueue.shift());
			}

			break;

		case 'firstmessage':
			hasKeyExchangeBegun	= true;
			break;

		case 'abort':
			smpError();
			abortSetup();
			break;

		case 'connected':
			isConnected	= true;

			while (preConnectMessageSendQueue.length) {
				otr.sendMsg(preConnectMessageSendQueue.shift());
			}

			if (webRTC.isSupported) {
				sendWebRTCDataToPeer();
			}
			break;

		case 'authenticated':
			markAllAsSent();
			pingPong();

			/* Ratchet channels every 10 - 20 minutes */
			if (e.data.message) {
				function ratchetLoop () {
					setTimeout(
						ratchetLoop,
						600000 + crypto.getRandomValues(new Uint8Array(1))[0] * 2350
					);

					ratchetChannels();
				}

				ratchetLoop();
			}
			break;
	}
}


var randomSeed	= new Uint8Array(50000);
crypto.getRandomValues(randomSeed);


/* TODO: Enable the Walken warning after further testing */

if (
	typeof webSign != 'undefined' &&
	webSign.detectChange &&
	webSign.detectChange() &&
	!WEBSIGN_HASHES[localStorage.webSignBootHash]
) {
	/*
		function warnWebSignObsoleteWrapper () {
			if (typeof warnWebSignObsolete == 'undefined') {
				setTimeout(warnWebSignObsoleteWrapper, 1000);
			}
			else {
				warnWebSignObsolete();
			}
		}

		warnWebSignObsoleteWrapper();
	*/

	webSignError();
}

// else {
$(function () {
	var urlFragment	= getUrlState();

	if (!urlFragment || urlFragment == 'new' || urlFragment.length > (SECRET_LENGTH * 2)) {
		shouldStartNewCyph	= true;
	}

	if (urlFragment && urlFragment.length > SECRET_LENGTH) {
		cyphId			= urlFragment.substr(0, SECRET_LENGTH);
		sharedSecret	= urlFragment.substr(SECRET_LENGTH);
	}

	if (!sharedSecret) {
		sharedSecret	= generateGuid(SECRET_LENGTH);
	}

	otrWorker.postMessage({method: 0, message: {
		cryptoCodes: localStorage.cryptoCodes,
		randomSeed: randomSeed,
		sharedSecret: sharedSecret
	}});


	function startOrJoinCyph (isFirstAttempt) {
		if (cyphId && !isFirstAttempt) {
			pushNotFound();
			return;
		}

		var id	= cyphId || generateGuid(SECRET_LENGTH);
		var o	= shouldStartNewCyph ? {channelDescriptor: getChannelDescriptor()} : null;

		$.ajax({
			type: 'POST',
			url: BASE_URL + 'channels/' + id,
			data: o,
			success: function (channelDescriptor) {
				if (cyphId || !o || channelDescriptor == o.channelDescriptor) {
					cyphId	= id;
					setUpChannel(channelDescriptor);
				}
				else {
					startOrJoinCyph();
				}
			},
			error: function () {
				startOrJoinCyph();
			}
		});
	}

	if (shouldStartNewCyph || cyphId) {
		if (!cyphId) {
			changeState(states.spinningUp);
		}

		history.pushState({}, '', document.location.pathname);
		startOrJoinCyph(true);
	}
	else {
		processUrlState();
	}
});
// }
/* End cyph init */


var connectedNotification	= getString('connectedNotification');
var disconnectWarning		= getString('disconnectWarning');

function beginChat () {
	beginChatUi(function () {
		$(window).on('beforeunload', function () {
			return disconnectWarning;
		});
	});
}


/* Intermittent check to verify chat is still alive + send fake encrypted chatter */

function pingPong () {
	var nextPing	= 0;

	onTick(function (now) {
		if (now - lastIncomingMessageTimestamp > 180000) {
			channelClose();
		}
		else if (now > nextPing) {
			nextPing	= now + (30000 + crypto.getRandomValues(new Uint8Array(1))[0] * 250);
			sendChannelData({Misc: channelDataMisc.ping});
		}
	});
}


function processUrlState () {
	if (isWebSignObsolete) {
		return;
	}

	var urlState	= getUrlState();

	/* 404 */
	if (urlState == '404') {
		changeState(states.error);
	}
	else {
		pushNotFound();
		return;
	}

	history.replaceState({}, '', '/' + getUrlState());
}


/* Logic for handling WebRTC connections (used for file transfers and voice/video chat) */

var PeerConnection		= window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate		= window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription	= window.mozRTCSessionDescription || window.RTCSessionDescription;
navigator.getUserMedia	= navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

var webRTC	= {
	peer: null,

	localStream: null,
	remoteStream: null,

	isAccepted: false,
	isAvailable: false,

	isSupported: !!PeerConnection,

	streamOptions: {},
	currentStreamOptions: null,

	$friendPlaceholder: $('#video-call .friend:not(.stream)'),
	$friendStream: $('#video-call .friend.stream'),
	$meStream: $('#video-call .me'),

	iceServer: 'ice.cyph.com',
	friendPlaceholderSrc: '/video/background.mp4',

	commands: {
		addIceCandidate: function (candidate) {
			if (webRTC.isAvailable) {
				webRTC.peer.addIceCandidate(new IceCandidate(JSON.parse(candidate)), function () {}, function () {});
			}
			else {
				setTimeout(function () {
					webRTC.commands.addIceCandidate(candidate);
				}, 500);
			}
		},

		decline: function (answer) {
			webRTC.isAccepted	= false;

			alertDialog({
				title: getString('videoCallingTitle'),
				content: getString('webRTCDeny'),
				ok: getString('ok')
			});
		},

		kill: function () {
			var wasAccepted		= webRTC.isAccepted;
			webRTC.isAccepted	= false;

			toggleVideoCall(false);

			setTimeout(function () {
				webRTC.$friendPlaceholder.attr('src', '');

				delete webRTC.streamOptions.video;
				delete webRTC.streamOptions.audio;
				delete webRTC.currentStreamOptions;

				if (webRTC.localStream) {
					webRTC.localStream.stop();
					delete webRTC.localStream;
				}

				if (webRTC.remoteStream) {
					delete webRTC.remoteStream;
				}

				webRTC.peer.close();

				if (wasAccepted) {
					var webRTCDisconnect	= getString('webRTCDisconnect');

					alertDialog({
						title: getString('videoCallingTitle'),
						content: webRTCDisconnect,
						ok: getString('ok')
					});

					addMessageToChat(webRTCDisconnect, authors.app, false);
				}
			}, 500);
		},

		receiveAnswer: function (answer) {
			webRTC.peer.setRemoteDescription(new SessionDescription(JSON.parse(answer)), function () {}, function () {});
			webRTC.isAvailable	= true;
		},

		receiveOffer: function (offer) {
			webRTC.helpers.setUpStream(null, offer);
		},

		updateVideoState: function (remoteSupportsVideo) {
			webRTC.$friendPlaceholder.toggle(!remoteSupportsVideo);
			webRTC.$friendStream.toggle(remoteSupportsVideo);
			webRTC.$friendPlaceholder.attr('src', remoteSupportsVideo ? '' : webRTC.friendPlaceholderSrc);
		}
	},

	helpers: {
		init: function () {
			if (webRTC.peer) {
				return;
			}

			var pc	= new PeerConnection({
				iceServers: [
					{url: 'stun:' + webRTC.iceServer, credential: 'cyph', username: 'cyph'},
					{url: 'turn:' + webRTC.iceServer, credential: 'cyph', username: 'cyph'}
				]
			}, {
				optional: [
					{DtlsSrtpKeyAgreement: true},
					{RtpDataChannels: true}
				]
			});

			pc.onicecandidate	= function (e) {
				if (e.candidate) {
					delete pc.onicecandidate;
					sendWebRTCDataToPeer({addIceCandidate: JSON.stringify(e.candidate)});
				}
			};

			pc.onaddstream	= function (e) {
				webRTC.remoteStream	= e.stream;
				webRTC.$friendStream.attr('src', webRTC.remoteStream ? URL.createObjectURL(webRTC.remoteStream) : '');
			};

			pc.onsignalingstatechange	= function (forceKill) {
				forceKill	= forceKill === true;

				if (webRTC.peer == pc && (forceKill || pc.signalingState == 'closed')) {
					webRTC.isAvailable	= false;

					delete pc.onaddstream;
					delete webRTC.remoteStream;
					delete webRTC.peer;

					if (forceKill) {
						pc.close();
					}

					webRTC.helpers.init();
				}
			};


			webRTC.peer	= pc;
		},

		kill: function () {
			sendWebRTCDataToPeer({kill: true});
			webRTC.commands.kill();
		},

		receiveCommand: function (command, data) {
			if (!webRTC.isSupported) {
				return;
			}

			if (webRTC.isAccepted && typeof webRTC.commands[command] == 'function') {
				webRTC.commands[command](data);
			}
			else if (command == 'voice' || command == 'video') {
				confirmDialog({
					title: getString('videoCallingTitle'),
					content:
						getString('webRTCRequest') + ' ' +
						getString(command + 'Call') + '. ' +
						getString('webRTCWarning')
					,
					ok: getString('continue'),
					cancel: getString('decline')
				}, function (ok) {
					if (ok) {
						webRTC.isAccepted	= true;
						webRTC.helpers.setUpStream({video: command == 'video', audio: true});

						anal.send({
							hitType: 'event',
							eventCategory: 'call',
							eventAction: 'start',
							eventLabel: command,
							eventValue: 1
						});
					}
					else {
						sendWebRTCDataToPeer({decline: true});
					}
				}, 500000);
			}
		},

		requestCall: function (isVideo) {
			var callType	= isVideo ? 'video' : 'voice';

			confirmDialog({
				title: getString('videoCallingTitle'),
				content:
					getString('webRTCInit') + ' ' +
					getString(callType + 'Call') + '. ' +
					getString('webRTCWarning')
				,
				ok: getString('continue'),
				cancel: getString('cancel')
			}, function (ok) {
				if (ok) {
					webRTC.isAccepted			= true;
					webRTC.streamOptions.video	= isVideo;
					webRTC.streamOptions.audio	= true;

					var o		= {};
					o[callType]	= true;
					sendWebRTCDataToPeer(o);

					setTimeout(function () {
						alertDialog({
							title: getString('videoCallingTitle'),
							content: getString('webRTCRequestConfirmation'),
							ok: getString('ok')
						});
					}, 250);

					/* Time out if request hasn't been accepted within 10 minutes */
					setTimeout(function () {
						if (!webRTC.isAvailable) {
							webRTC.isAccepted	= false;
						}
					}, 600000);
				}
			});
		},

		setUpStream: function (opt_streamOptions, opt_offer) {
			webRTC.helpers.init();

			if (opt_streamOptions) {
				if (opt_streamOptions.video === true || opt_streamOptions.video === false) {
					webRTC.streamOptions.video	= opt_streamOptions.video;
				}
				if (opt_streamOptions.audio === true || opt_streamOptions.audio === false) {
					webRTC.streamOptions.audio	= opt_streamOptions.audio;
				}
			}

			var streamHelper, streamFallback, streamSetup;

			streamHelper	= function (stream) {
				if (webRTC.localStream) {
					webRTC.localStream.stop();
					delete webRTC.localStream;
				}
				else {
					addMessageToChat(getString('webRTCConnect'), authors.app, false);
				}

				if (stream) {
					if (webRTC.peer.getLocalStreams().length > 0) {
						webRTC.peer.onsignalingstatechange(true);
					}

					webRTC.localStream	= stream;
					webRTC.peer.addStream(webRTC.localStream);
					webRTC.$meStream.attr('src', URL.createObjectURL(webRTC.localStream));
				}

				[
					{k: 'audio', f: 'getAudioTracks'},
					{k: 'video', f: 'getVideoTracks'}
				].forEach(function (o) {
					webRTC.streamOptions[o.k]	= webRTC.localStream && webRTC.localStream[o.f]().
						map(function (track) { return track.enabled }).
						reduce(function (a, b) { return a || b }, false)
					;
				});


				if (!opt_offer) {
					webRTC.peer.createOffer(function (offer) {
						/* http://www.kapejod.org/en/2014/05/28/ */
						offer.sdp	= offer.sdp.
							split('\n').
							filter(function (line) {
								return line.indexOf('urn:ietf:params:rtp-hdrext:ssrc-audio-level') < 0 &&
									line.indexOf('b=AS:') < 0
								;
							}).
							join('\n')
						;

						webRTC.peer.setLocalDescription(offer, function () {}, function () {});
						sendWebRTCDataToPeer({receiveOffer: JSON.stringify(offer), updateVideoState: webRTC.streamOptions.video});
					}, webRTC.helpers.kill, {offerToReceiveAudio: true, offerToReceiveVideo: true});
				}
				else {
					webRTC.peer.setRemoteDescription(new SessionDescription(JSON.parse(opt_offer)), function () {
						webRTC.peer.createAnswer(function (answer) {
							webRTC.peer.setLocalDescription(answer, function () {}, function () {});
							sendWebRTCDataToPeer({receiveAnswer: JSON.stringify(answer), updateVideoState: webRTC.streamOptions.video});

							webRTC.isAvailable	= true;
						}, webRTC.helpers.kill);
					}, webRTC.helpers.kill);
				}

				toggleVideoCall(true);
			};

			streamFallback	= function () {
				if (webRTC.streamOptions.video) {
					webRTC.streamOptions.video	= false;
				}
				else if (webRTC.streamOptions.audio) {
					webRTC.streamOptions.audio	= false;
				}

				streamSetup();
			};

			streamSetup	= function () {
				webRTC.currentStreamOptions	= JSON.stringify(webRTC.streamOptions);

				if (webRTC.streamOptions.video || webRTC.streamOptions.audio) {
					navigator.getUserMedia(webRTC.streamOptions, streamHelper, streamFallback);
				}
				else {
					streamHelper();
				}
			};

			streamSetup();
		}
	}
};

/* Mobile workaround */
$(function () {
	$(window).one('click', function () { webRTC.$friendPlaceholder[0].play() });
});

function sendWebRTCDataToPeer (o) {
	sendChannelData({Misc: WEBRTC_DATA_PREFIX + (o ? JSON.stringify(o) : '')});
}



function channelSend () {
	var c	= (shouldUseOldChannel && oldChannel && oldChannel.isAlive()) ?
		oldChannel :
		channel
	;

	if (c) {
		c.send.apply(c, arguments);
	}
	else {
		var args	= arguments;
		setTimeout(function () { channelSend.apply(null, args) }, 500);
	}
}

function channelClose (hasReceivedDestroySignal) {
	webRTC.helpers.kill();

	var c	= channel || oldChannel;

	if (c) {
		if (hasReceivedDestroySignal) {
			c.close(closeChat);
		}
		else if (isAlive) {
			channelSend({Destroy: true}, closeChat, true);
		}
	}
	else {
		closeChat();
	}
}



var sendChannelDataQueue	= [];

var receiveChannelDataQueue	= [];
var receivedMessages		= {};

function sendChannelData (data) {
	otr.sendMsg(CHANNEL_DATA_PREFIX + JSON.stringify(data));
}

function sendChannelDataBase (data, callback) {
	sendChannelDataQueue.push({data: data, callback: callback});
}

function sendChannelDataHandler (items) {
	lastOutgoingMessageTimestamp	= Date.now();

	channelSend(
		items.map(function (item) {
			item.data.Id	= Date.now() + '-' + crypto.getRandomValues(new Uint32Array(1))[0];
			return item.data;
		}),
		items.map(function (item) { return item.callback })
	);

	anal.send({
		hitType: 'event',
		eventCategory: 'message',
		eventAction: 'sent',
		eventValue: items.length
	});
}

function receiveChannelData (data) {
	receiveChannelDataQueue.push(data);
}

function receiveChannelDataHandler (o) {
	if (!o.Id || !receivedMessages[o.Id]) {
		lastIncomingMessageTimestamp	= Date.now();

		if (o.Misc == channelDataMisc.connect) {
			beginChat();
		}
		else if (o.Misc == channelDataMisc.imtypingyo) {
			friendIsTyping(true);
		}
		else if (o.Misc == channelDataMisc.donetyping) {
			friendIsTyping(false);
		}
		else if (o.Misc && o.Misc.indexOf(WEBRTC_DATA_PREFIX) == 0) {
			var webRTCDataString	= o.Misc.split(WEBRTC_DATA_PREFIX)[1];

			if (webRTCDataString) {
				var webRTCData	= JSON.parse(o.Misc.split(WEBRTC_DATA_PREFIX)[1]);

				Object.keys(webRTCData).forEach(function (key) {
					webRTC.helpers.receiveCommand(key, webRTCData[key]);
				});
			}
			else if (webRTC.isSupported) {
				enableWebRTC();
			}
		}
		else if (o.Misc && o.Misc.indexOf(CHANNEL_RATCHET_PREFIX) == 0) {
			ratchetChannels(o.Misc.split(CHANNEL_RATCHET_PREFIX)[1]);
		}

		if (o.Message) {
			otr.receiveMsg(o.Message);
			logCyphertext(o.Message, authors.friend);
		}

		if (o.Destroy) {
			channelClose(true);
		}

		if (o.Id) {
			receivedMessages[o.Id]	= true;
		}
	}
}

function setUpChannel (channelDescriptor) {
	var isNotCreator;

	channel	= new Channel(channelDescriptor, {
		onopen: function (isCreator) {
			if (isCreator) {
				beginWaiting();
			}
			else {
				isNotCreator	= true;

				beginChat();
				sendChannelDataBase({Misc: channelDataMisc.connect});
				otr.sendQueryMsg();

				anal.send({
					hitType: 'event',
					eventCategory: 'cyph',
					eventAction: 'started',
					eventValue: 1
				});
			}

			$(window).unload(function () {
				channelClose();
			});
		},
		onmessage: receiveChannelData,
		onlag: function (lag, region) {
			if (isNotCreator && isConnected) {
				ratchetChannels();
			}

			anal.send({
				hitType: 'event',
				eventCategory: 'lag',
				eventAction: 'detected',
				eventLabel: region,
				eventValue: lag
			});
		}
	});
}



/*
	Alice: create new channel, send descriptor over old channel, destroy old-old channel
	Bob: join new channel, ack descriptor over old channel, destroy old-old channel
	Alice: deprecate old channel, inform of deprecation over new channel
	Bob: deprecation old channel
*/

var lastChannelRatchet	= 0;

function ratchetChannels (channelDescriptor) {
	/* Block ratchet from being initiated more than once within a three-minute period */
	if (!channelDescriptor) {
		var last			= lastChannelRatchet;
		lastChannelRatchet	= Date.now();

		if (lastChannelRatchet - last < 180000) {
			return;
		}
	}


	if (shouldUseOldChannel) {
		shouldUseOldChannel	= false;

		if (channelDescriptor) {
			sendChannelData({Misc: CHANNEL_RATCHET_PREFIX});
		}
	}
	else {
		oldChannel && oldChannel.close();
		oldChannel			= channel;
		shouldUseOldChannel	= true;

		channelDescriptor	= channelDescriptor || getChannelDescriptor();
		channel				= new Channel(channelDescriptor, {
			onopen: function () {
				sendChannelData({Misc: CHANNEL_RATCHET_PREFIX + channelDescriptor});
			},
			onmessage: receiveChannelData
		});
	}
}



/* Event loop for processing incoming messages */

onTick(function (now) {
	/*** send ***/
	if (
		isAlive &&
		sendChannelDataQueue.length &&
		(
			sendChannelDataQueue.length >= 8 ||
			!lastOutgoingMessageTimestamp ||
			(now - lastOutgoingMessageTimestamp) > 500
		)
	) {
		var sendChannelDataQueueSlice	= sendChannelDataQueue.slice(0, 8);
		sendChannelDataQueue			= sendChannelDataQueue.slice(8);

		sendChannelDataHandler(sendChannelDataQueueSlice);
	}

	/*** receive ***/
	else if (receiveChannelDataQueue.length) {
		receiveChannelDataHandler(receiveChannelDataQueue.shift());
	}

	/*** otrWorker onmessage ***/
	else if (otrWorkerOnMessageQueue.length) {
		otrWorkerOnMessageHandler(otrWorkerOnMessageQueue.shift());
	}

	/*** else ***/
	else {
		return false;
	}

	return true;
});



/* Set Analytics information */

anal.set({
	appName: 'cyph.im',
	appVersion: 'Web'
});
