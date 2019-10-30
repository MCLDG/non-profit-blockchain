#!/bin/bash

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

# Creates the CloudWatch scheduled event rule that will trigger the Health Check Lambda on a pre-defined schedule

rule=$(aws events put-rule \
--name peer-health-check-rule \
--schedule-expression 'rate(1 minute)' \
--region $REGION \
--tags Key=networkId,Value=${NETWORKID} --tags Key=memberId,Value=${MEMBERID})

rulearn=$(aws events describe-rule --name peer-health-check-rule --region $REGION --query 'Arn' --output text)
rulearn=$rule.RuleArn;

aws lambda add-permission \
--function-name health-function \
--statement-id health-scheduled-event \
--action 'lambda:InvokeFunction' \
--principal events.amazonaws.com \
--region $REGION \
--source-arn $rulearn

functionarn=$(aws lambda get-function --function-name  health-function --region us-east-1 --query 'Configuration.FunctionArn' --output text)

aws events put-targets \
--rule peer-health-check-rule \
--region $REGION \
--targets "Id"="1","Arn"=$functionarn


