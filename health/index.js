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

/*
    Performs a health check against all peer nodes in an AMB network. The input
    argument to this function looks as follows:

    {
        "networkId": "n-6HQQS33ZMVAGJG7CISVGFNWIPU",
        "memberId": "m-QIQPG3G2PZEERHCPVFLYH6ZN54"
    }
*/

'use strict';

let AWS = require('aws-sdk');
//let lambda = new AWS.Lambda();
//let sns = new AWS.SNS();
let managedblockchain = new AWS.ManagedBlockchain();
let data;

exports.handler = async (event) => {
    let networkId = event.networkId;
    let memberId = event.memberId;
    try {
        //data = await sns.listTopics().promise();
        //data = await lambda.getAccountSettings().promise();
        var params = {
            MemberId: memberId,
            NetworkId: networkId
        };

        logger.info('##### About to call listNodes: ' + params);
        data = await managedblockchain.listNodes(params).promise();
    }
    catch (err) {
        console.log(err);
        return err;
    }
    return data;
};

// const util = require("util");
// const AWS = require("aws-sdk");
// let managedblockchain = new AWS.ManagedBlockchain();
// const amb = require('aws-sdk/clients/managedblockchain');
// const logger = require("./logging").getLogger("lambdaFunction");


// async function handler(event) {
//     const promise = new Promise(async (resolve, reject) => {

//         let networkId = event.networkId;
//         let memberId = event.memberId;
//         let data;
//         let unavailablePeers = [];

//         try {
//             logger.info("=== Handler Function Start ===" + JSON.stringify(event, null, 2));

//             var params = {
//                 MemberId: memberId,
//                 NetworkId: networkId
//             };

//             logger.info('##### About to call listNodes: ' + params);
//             data = await managedblockchain.listNodes(params);
//             logger.info('##### Output of listNodes called during peer health check: ' + data);
//             logger.info('##### Output of listNodes called during peer health check: ' + util.inspect(data));
//             // var peerUnavailable = false;
//             // for (var i = 0; i < data.Nodes.length; i++) {
//             //     var node = data.Nodes[i];
//             //     if (node.Status != 'AVAILABLE') {
//             //         unavailablePeers.push(node.Id + ' ' + node.Status);
//             //         peerUnavailable = true;
//             //     }
//             //     logger.info('##### GET on healthpeers. Node is : ' + util.inspect(node));
//             // }
//             // if (peerUnavailable)
//             //     throw new Error('Peer node(s) unavailable: ' + unavailablePeers);

//             logger.info("=== Handler Function End ===");
//             return resolve(data);
//         } catch (err) {
//             logger.error('##### Error during peer health check: ' + util.inspect(err) + ' ' + util.inspect(err.stack));
//             reject(Error(err));
//         }
//     });
//     return promise;
// };

// module.exports = { handler };