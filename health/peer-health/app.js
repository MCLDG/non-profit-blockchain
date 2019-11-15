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
        "networkId": "n-6HQQS33ZMVAGJG7CISVGFNWIPU"
    }
*/

'use strict';

const util = require("util");
const AWS = require('aws-sdk');
const managedblockchain = new AWS.ManagedBlockchain();
const cloudwatch = new AWS.CloudWatch();
const logger = require("./logging").getLogger("peer-health-Lambda");

exports.handler = async (event) => {
    let networkId = event.networkId;
    let unavailableNodes = [];
    let networkInfo = {};
    networkInfo.type = 'ManagedBlockchainConsolidatedNetworkInfo';
    networkInfo.networkId = networkId;
    networkInfo.members = [];
    let nodeUnavailable = false;

    try {
        logger.info("=== Handler Function Start at timestamp: " + new Date().toISOString() + ' ' + JSON.stringify(event, null, 2));

        let params = {
            NetworkId: networkId
        };

        logger.info('##### At timestamp: ' + new Date().toISOString() + '. About to call listMembers: ' + JSON.stringify(params));
        let members = await managedblockchain.listMembers(params).promise();
        logger.debug('##### At timestamp: ' + new Date().toISOString() + '. Output of listMembers called during peer health check: ' + JSON.stringify(members));

        for (let i = 0; i < members.Members.length; i++) {
            let member = members.Members[i];
            let memberStatus = {};
            memberStatus.memberId = member.Id;
            memberStatus.memberName = member.Name;
            memberStatus.memberStatus = member.Status;
            memberStatus.memberIsOwned = member.IsOwned;

            if (member.Status != 'AVAILABLE') {
                // ignore members with other status'
                logger.info('##### Member: ' + member.Id + ' is not AVAILABLE, and will be ignored. Member details are: ' + JSON.stringify(member));
                networkInfo.members.push(memberStatus);
                continue;
            }

            let params = {
                NetworkId: networkId,
                MemberId: member.Id
            };

            logger.info('##### At timestamp: ' + new Date().toISOString() + '. About to call listNodes for network and member: ' + JSON.stringify(params));
            let nodes = await managedblockchain.listNodes(params).promise();
            logger.debug('##### At timestamp: ' + new Date().toISOString() + '. Output of listNodes called during peer health check: ' + JSON.stringify(nodes));

            let nodeInfo = [];
            for (let i = 0; i < nodes.Nodes.length; i++) {
                let node = nodes.Nodes[i];
                let nodeStatus = {};
                nodeStatus.Id = node.Id;
                nodeStatus.nodeStatus = node.Status;
                nodeStatus.nodeAvailabilityZone = node.AvailabilityZone;
                nodeStatus.nodeInstanceType = node.InstanceType;

                let nodeAvailable = 1;
                if (node.Status == 'DELETED') {
                    //TODO: code needs to look for nodes with a status of FAILED. All other status' should be ignored
                    //I use other status here for testing purposes only. It's difficult to FAIL a peer node, but easy to CREATE/DELETE
                    nodeAvailable = 0;
                }
                else if (node.Status != 'AVAILABLE') {
                    unavailableNodes.push(node.Id + ' ' + node.Status);
                    nodeUnavailable = true;
                    nodeAvailable = 0;
                }
                logger.debug('##### Looping through nodes in healthpeers. Node is : ' + JSON.stringify(node));
                nodeInfo.push(nodeStatus);

                // Publish a custom metric for each node to indidate whether available or not
                let cwParams = {
                    Namespace: 'custom/managedblockchain',
                    MetricData: [
                        {
                            MetricName: 'Availability',
                            Dimensions: [
                                {
                                    Name: 'NetworkId',
                                    Value: networkId
                                },
                                {
                                    Name: 'MemberId',
                                    Value: member.Id
                                },
                                {
                                    Name: 'AccountOwnsMember',
                                    Value: member.IsOwned.toString()
                                },
                                {
                                    Name: 'NodeId',
                                    Value: node.Id
                                },
                                {
                                    Name: 'NodeInstanceType',
                                    Value: node.InstanceType
                                }
                            ],
                            StorageResolution: '60',
                            Unit: 'Count',
                            Value: nodeAvailable
                        },
                    ]
                };
                let cwMetric = await cloudwatch.putMetricData(cwParams).promise();
                logger.debug('##### Output of putMetricData called during peer health check: ' + JSON.stringify(cwMetric));

                // Update the CW alarm. This should either set the alarm on or off, depending on whether the peer node is
                // available or not
                let cwAlarmParams = {
                    AlarmName: 'NodeAvailability-' + node.Id,
                    ComparisonOperator: 'LessThanThreshold',
                    EvaluationPeriods: '1',
                    AlarmDescription: 'Alarm if managed blockchain peer node becomes UNAVAILABLE',
                    Dimensions: [
                        {
                            Name: 'NetworkId',
                            Value: networkId
                        },
                        {
                            Name: 'MemberId',
                            Value: member.Id
                        },
                        {
                            Name: 'AccountOwnsMember',
                            Value: member.IsOwned.toString()
                        },
                        {
                            Name: 'NodeId',
                            Value: node.Id
                        },
                        {
                            Name: 'NodeInstanceType',
                            Value: node.InstanceType
                        }
                    ],
                    MetricName: 'Availability',
                    Namespace: 'custom/managedblockchain',
                    Period: '60',
                    Statistic: 'Sum',
                    Threshold: '1',
                    TreatMissingData: 'missing'
                };

                let cwAlarm = await cloudwatch.putMetricAlarm(cwAlarmParams).promise();
                logger.debug('##### Output of putMetricAlarm called during peer health check: ' + JSON.stringify(cwAlarmParams));
            }

            // Store the node status for writing to the log after the loop is complete
            memberStatus.nodeInfo = nodeInfo;
            networkInfo.members.push(memberStatus);
        }

        logger.info('##### HealthCheck - Managed Blockchain network status: ' + JSON.stringify(networkInfo));

        if (nodeUnavailable)
            throw new Error('##### Managed blockchain node(s) unavailable: ' + unavailableNodes);

        logger.info("=== Handler Function End at timestamp: " + new Date().toISOString());
    }
    catch (err) {
        logger.error('##### Error when checking health of blockchain nodes, throwing an exception: ' + err);
        throw err;
    }
    logger.debug('##### All nodes are healthy. Returning HTTP 200');
    let response = {
        'statusCode': 200,
        'body': JSON.stringify({
            networkInfo
        })
    }
    return response;
};