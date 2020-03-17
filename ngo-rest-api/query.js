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
*/

var util = require('util');
var helper = require('./connection.js');
var logger = helper.getLogger('Query');

var channel = null;

var queryChaincode = async function(peers, channelName, chaincodeName, args, fcn, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START queryChaincode for fcn: ' + fcn + '.- Successfully got the fabric client for the organization "%s"', orgName);
		if (!channel) channel = client.getChannel(channelName);
		if (!channel) {
			let message = util.format('##### queryChaincode - fcn: ' + fcn + '. Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}

		// send query
		var request = {
			targets: peers,
			chaincodeId: chaincodeName,
			fcn: fcn,
			args: [JSON.stringify(args)]
		};

		logger.info('##### queryChaincode - fcn: ' + fcn + '. Query request to Fabric %s', JSON.stringify(request));
		let responses = await channel.queryByChaincode(request);

		if (!responses) {
			logger.error(`##### queryChaincode - Unable to queryByChaincode for fcn: ${fcn}. No responses returned from peers`);
			throw new Error(`##### queryChaincode - Unable to queryByChaincode for fcn: ${fcn}. No responses returned from peers`);
		}

		for (let i = 0; i < responses.length; i++) {
			logger.info(util.format('Query result from peer [%s]: %s', i, responses[i].toString('utf8')));
		}
		
		const validResponses = [];
		const errorResponses = [];

		responses.forEach((responseContent) => {
			if (responseContent instanceof Error || responseContent.toString('utf8').indexOf("Error: transaction returned with failure") != -1 || responseContent.toString('utf8').indexOf("Error: failed to execute transaction") != -1) {
				logger.warn('##### queryChaincode - fcn: ' + fcn + '.  Received error response from peer:', responseContent);
				errorResponses.push(responseContent);
			}
			else {
				logger.debug('##### queryChaincode - fcn: ' + fcn + '. valid response from peer %s', responseContent);
				validResponses.push(responseContent);
			}
		});

		if (validResponses.length === 0) {
			const errorMessages = errorResponses.map((response) => util.format('peer=%s, status=%s, message=%s',
				response.peer.name, response.status, response.message));
			const messages = Array.of(`No valid responses from any peers. ${errorResponses.length} peer error responses:`,
				...errorMessages);
			const msg = messages.join('\n    ');
			logger.error('##### queryChaincode - fcn: ' + fcn + '.  ' + msg);
			throw new Error(msg);
		}

		let ret = [];
		// We will only use the first response. If we are querying history, we return the entire payload as it
		// contains useful info such as the transaction ID. Otherwise we strip out the Fabric key and just return the payload
		let json = JSON.parse(validResponses[0].toString('utf8'));
		logger.info('##### queryChaincode - fcn: ' + fcn + '. Valid response as JSON %s', util.inspect(json));
		if (Array.isArray(json)) {
			if (fcn == 'queryHistoryForKey') {
				ret.push(json);
			}
			else {
				for (let key in json) {
					if (json[key]['Record']) {
						ret.push(json[key]['Record']);
					}
					else {
						ret.push(json[key]);
					}
				}
			}
		}
		else {
			ret.push(json);
		}
		return ret;
	}
	catch (error) {
		logger.error('##### queryChaincode - fcn: ' + fcn + '. Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

var getChannelsForPeer = async function(peer, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START getChannelsForPeer - Successfully got the fabric client for the organization "%s"', orgName);

		let response_payload = await client.queryChannels(peer);
		if (response_payload) {
			logger.debug(response_payload);
			return response_payload;
		}
		else {
			logger.error('##### getChannelsForPeer - response_payload is null');
			return 'response_payload is null';
		}
	}
	catch (error) {
		logger.error('##### getChannelsForPeer - Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

var getChaincodesForPeer = async function(peer, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START getChaincodesForPeer - Successfully got the fabric client for the organization "%s"', orgName);

		let response_payload = await client.queryInstalledChaincodes(peer);
		if (response_payload) {
			logger.debug(response_payload);
			return response_payload;
		}
		else {
			logger.error('##### getChaincodesForPeer - response_payload is null');
			return 'response_payload is null';
		}
	}
	catch (error) {
		logger.error('##### getChaincodesForPeer - Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

var queryChannelInfo = async function(peer, channelName, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START queryChannelInfo - Successfully got the fabric client for the organization "%s"', orgName);
		var channel = client.getChannel(channelName);
		if (!channel) {
			let message = util.format('##### queryChannelInfo - Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}


		let response_payload = await channel.queryInfo(peer);
		if (response_payload) {
			logger.debug(response_payload);
			return response_payload;
		}
		else {
			logger.error('##### queryChannelInfo - response_payload is null');
			return 'response_payload is null';
		}
	}
	catch (error) {
		logger.error('##### queryChannelInfo - Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

var getInstantiatedChaincodes = async function(peer, channelName, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START getInstantiatedChaincodes - Successfully got the fabric client for the organization "%s"', orgName);
		var channel = client.getChannel(channelName);
		if (!channel) {
			let message = util.format('##### getInstantiatedChaincodes - Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}

		let response_payload = await channel.queryInstantiatedChaincodes(peer);
		if (response_payload) {
			logger.debug(response_payload);
			return response_payload;
		}
		else {
			logger.error('##### getInstantiatedChaincodes - response_payload is null');
			return 'response_payload is null';
		}
	}
	catch (error) {
		logger.error('##### getInstantiatedChaincodes - Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

var getBlockByNumber = async function(peer, channelName, blockId, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START getBlockByNumber - Successfully got the fabric client for the organization "%s"', orgName);
		var channel = client.getChannel(channelName);
		if (!channel) {
			let message = util.format('##### getBlockByNumber - Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}

		let response_payload = await channel.queryBlock(parseInt(blockId), peer);
		if (response_payload) {
			logger.debug(response_payload);
			return response_payload;
		}
		else {
			logger.error('##### getBlockByNumber - response_payload is null');
			return 'response_payload is null';
		}
	}
	catch (error) {
		logger.error('##### getBlockByNumber - Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

var getTransactionById = async function(peer, channelName, transactionId, userName, orgName) {
	try {
		// setup the client for this org
		var client = await helper.getClientForOrg(orgName, userName);
		logger.info('============ START getTransactionById - Successfully got the fabric client for the organization "%s"', orgName);
		var channel = client.getChannel(channelName);
		if (!channel) {
			let message = util.format('##### getTransactionById - Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}

		let response_payload = await channel.queryTransaction(transactionId, peer);
		if (response_payload) {
			logger.debug(response_payload);
			return response_payload;
		}
		else {
			logger.error('##### getTransactionById - response_payload is null');
			return 'response_payload is null';
		}
	}
	catch (error) {
		logger.error('##### getTransactionById - Failed to query due to error: ' + error.stack ? error.stack : error);
		return error.toString();
	}
};

exports.queryChaincode = queryChaincode;
exports.getChannelsForPeer = getChannelsForPeer;
exports.getChaincodesForPeer = getChaincodesForPeer;
exports.queryChannelInfo = queryChannelInfo;
exports.getInstantiatedChaincodes = getInstantiatedChaincodes;
exports.getBlockByNumber = getBlockByNumber;
exports.getTransactionById = getTransactionById;
