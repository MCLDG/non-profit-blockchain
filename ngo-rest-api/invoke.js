/*
# Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# 
# Licensed under the Apache License, Version 2.0 (the "License").
# You may not use this file except in compliance with the License.
# A copy of the License is located at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# or in the "license" file accompanying this file. This file is distributed 
# on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either 
# express or implied. See the License for the specific language governing 
# permissions and limitations under the License.
#
*/

'use strict';
var util = require('util');
var helper = require('./connection.js');
var logger = helper.getLogger('Invoke');
var channel = null;

//Have to use this wrapper to properly handle rejection error from channel.sendTransactionProposal
function __sendTransactionProposal(channel, request, timeout) {
	const fcnName = "[invokeChaincode __sendTransactionProposal]";

	return new Promise((resolve, reject) => {
		channel.sendTransactionProposal(request, timeout)
			.then((results) => {
				resolve(results);
			})
			.catch((err) => {
				throw new Error('${fcnName} ${err}');
			});
	});
}

var invokeChaincode = async function (peerNames, channelName, chaincodeName, args, fcn, userName, orgName) {
	logger.info(util.format('\n============ invokeChaincode - chaincode %s, function %s, on the channel \'%s\' for org: %s\n',
		chaincodeName, fcn, channelName, orgName));
	var error_message = null;
	var txIdAsString = null;
	try {
		// first setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('##### invokeChaincode - Successfully got the fabric client for the organization "%s"', orgName);
		if (!channel) channel = client.getChannel(channelName);
		if (!channel) {
			let message = util.format('##### invokeChaincode - Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}
		var txId = client.newTransactionID();
		txIdAsString = txId.getTransactionID();

		// send proposal to endorsing peers
		var request = {
			targets: peerNames,
			chaincodeId: chaincodeName,
			fcn: fcn,
			args: [JSON.stringify(args)],
			chainId: channelName,
			txId: txId
		};

		logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. Invoke transaction request to Fabric %s', JSON.stringify(request));
		let results;
		try {
			results = await __sendTransactionProposal(channel, request, 30000);
		} catch (err) {
			logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. got error while sending transaction proposal:' + err);
			logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. retrying one more time before throwing an error');
			results = await __sendTransactionProposal(channel, request, 30000);
		}

		if (!results) {
			logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. Unable to obtain transaction proposal for txId: ' + txIdAsString);
			throw new Error('##### invokeChaincode - txId: ' + txIdAsString + '. Unable to obtain transaction proposal for txId: ' + txIdAsString);
		}

		// the returned object has both the endorsement results
		// and the actual proposal, the proposal will be needed
		// later when we send a transaction to the ordering service
		var proposalResponses = results[0];
		var proposal = results[1];

		if (!proposalResponses.length) {
			logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. proposalResponses is empty: No results were returned from the request');
			throw new Error('##### invokeChaincode - txId: ' + txIdAsString + '. No results were returned from the sendTransactionProposal request');
		}

		logger.info(util.format(
			'##### invokeChaincode - txId: ' + txIdAsString + '. Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
			util.inspect(proposalResponses)));

		const validResponses = [];
		const errorResponses = [];

		proposalResponses.forEach((responseContent) => {
			if (responseContent instanceof Error) {
				logger.warn('##### invokeChaincode - txId: ' + txIdAsString + '.  Received error response from peer:', responseContent);
				errorResponses.push(responseContent);
			} else {
				logger.debug('##### invokeChaincode - txId: ' + txIdAsString + '. valid response from peer %j', responseContent.peer);
				validResponses.push(responseContent);
			}
		});

		if (validResponses.length === 0) {
			const errorMessages = errorResponses.map((response) => util.format('peer=%s, status=%s, message=%s',
				response.peer.name, response.status, response.message));
			const messages = Array.of('No valid responses from any peers. ${errorResponses.length} peer error responses:',
				...errorMessages);
			const msg = messages.join('\n    ');
			logger.error('##### invokeChaincode - txId: ' + txIdAsString + '.  ' + msg);
			throw new Error(msg);
		}

		logger.info(util.format(
			'##### invokeChaincode - txId: ' + txIdAsString + '. Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
			validResponses[0].response.status, validResponses[0].response.message));

		// wait for the channel-based event hub to tell us
		// that the commit was good or bad on each peer in our organization
		var promises = [];
		let event_hubs = channel.getChannelEventHubsForOrg();
		event_hubs.forEach((eh) => {
			logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. invokeEventPromise - setting up event handler');
			let invokeEventPromise = new Promise((resolve, reject) => {
				let timer = true;
				let maxRetries = 10;
				let event_timeout = setTimeout(() => {
					let message = '##### invokeChaincode - txId: ' + txIdAsString + '. REQUEST_TIMEOUT:' + eh.getPeerAddr();
					logger.error(message);
					timer = false;
					eh.disconnect();
				}, 10000);
				eh.registerTxEvent(txIdAsString, (tx, code, block_num) => {
						logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. The invoke chaincode transaction has been committed on peer %s', eh.getPeerAddr());
						logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. Transaction %s has status of %s in block %s', tx, code, block_num);
						clearTimeout(event_timeout);

						if (code !== 'VALID') {
							let message = util.format('##### invokeChaincode - txId: ' + txIdAsString + '. The invoke chaincode transaction was invalid, code:%s', code);
							logger.error(message);
							reject(new Error(message));
						} else {
							let message = '##### invokeChaincode - txId: ' + txIdAsString + '. The invoke chaincode transaction was valid.';
							logger.info(message);
							resolve(message);
						}
					}, (err) => {
						if (eh.isconnected()) {
							logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. Failed to receive the block event: ' + err);
							logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. Event hub connected. Peer name: ' + eh.getPeerAddr() + ' Channel name: ' + channel.getName());
							clearTimeout(event_timeout);
							reject('##### invokeChaincode - txId: ' + txIdAsString + '. Failed to receive the block event: ' + err);
						} else {
							// Trying to reconnect until we run out of time in the main timer 'event_timeout' 
							// or we reach maximum number of retries
							if (timer && (maxRetries >= 0)) {
								maxRetries -= 1;
								eh.checkConnection(true);
								logger.debug('##### invokeChaincode - txId: ' + txIdAsString + '. Retrying Event Hub connection for txId ' + txIdAsString);
							} else {
								logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. Seems like we ran out of time for Event Hub timeout or reached max number of retries: ' + maxRetries);
								reject('##### invokeChaincode - txId: ' + txIdAsString + '. Seems like we ran out of time for Event Hub timeout or reached max number of retries: ' + maxRetries);
							}
						}
						clearTimeout(event_timeout);
						logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. in Event Hub - Error in event hub listener registerTxEvent ' + err);
						reject(err);
					},
					// the default for 'unregister' is true for transaction listeners
					// so no real need to set here, however for 'disconnect'
					// the default is false as most event hubs are long running
					// in this use case we are using it only once
					{
						unregister: true,
						disconnect: false
					}
				);
				eh.connect();
			});
			promises.push(invokeEventPromise);
		});

		var orderer_request = {
			txId: txId,
			proposalResponses: validResponses,
			proposal: proposal
		};
		var sendPromise = channel.sendTransaction(orderer_request, 30000);
		// put the send to the ordering service last so that the events get registered and
		// are ready for the orderering and committing
		promises.push(sendPromise);
		results = await Promise.all(promises);
		logger.info(util.format('##### invokeChaincode - txId: ' + txIdAsString + '.  ------->>> R E S P O N S E : %j', results));
		let response = results.pop(); //  ordering service results are last in the results
		if (response.status === 'SUCCESS') {
			logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. Successfully sent transaction to the ordering service.');
		} else {
			error_message = util.format('##### invokeChaincode - txId: ' + txIdAsString + '. Failed to order the transaction. Error code: %s', response.status);
			logger.info(error_message);
		}

		// now see what each of the event hubs reported
		for (let i in results) {
			let event_hub_result = results[i];
			let event_hub = event_hubs[i];
			logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. Event results for event hub :%s', event_hub.getPeerAddr());
			if (typeof event_hub_result === 'string') {
				logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. ' + event_hub_result);
			} else {
				if (!error_message) error_message = event_hub_result.toString();
				logger.info('##### invokeChaincode - txId: ' + txIdAsString + '. ' + event_hub_result.toString());
			}
		}
	} catch (error) {
		logger.error('##### invokeChaincode - txId: ' + txIdAsString + '. Failed to invoke due to error: ' + error.stack ? error.stack : error);
		error_message = error.toString();
	}

	if (!error_message) {
		let message = util.format(
			'##### invokeChaincode - txId: ' + txIdAsString + '. Successfully invoked chaincode %s, function %s, on the channel \'%s\' for org: %s and transaction ID: %s',
			chaincodeName, fcn, channelName, orgName, txIdAsString);
		logger.info(message);
		let response = {};
		response.transactionId = txIdAsString;
		return response;
	} else {
		let message = util.format('##### invokeChaincode - txId: ' + txIdAsString + '. Failed to invoke chaincode. cause:%s', error_message);
		logger.error(message);
		throw new Error(message);
	}
};

exports.invokeChaincode = invokeChaincode;