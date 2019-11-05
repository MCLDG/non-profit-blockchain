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

# Uses SAM (serverless application model) to deploy the peer health check Lambda function

echo Install homebrew, used to install the SAM CLI
sh -c "$(curl -fsSL https://raw.githubusercontent.com/Linuxbrew/install/master/install.sh)"
test -d ~/.linuxbrew && eval $(~/.linuxbrew/bin/brew shellenv)
test -d /home/linuxbrew/.linuxbrew && eval $(/home/linuxbrew/.linuxbrew/bin/brew shellenv)
test -r ~/.bash_profile && echo "eval \$($(brew --prefix)/bin/brew shellenv)" >>~/.bash_profile
echo "eval \$($(brew --prefix)/bin/brew shellenv)" >>~/.profile
brew --version

echo Install the SAM CLI
brew tap aws/tap
brew install aws-sam-cli
sam --version

echo Using SAM to build and deploy the Lambda function
aws s3 mb s3://$NETWORKNAME-peer-health --region $REGION  
sam build

#Step 3 - Package your application
sam package --output-template peer-health.yaml --s3-bucket $NETWORKNAME-peer-health

#Step 4 - Deploy your application
sam deploy --template-file peer-health.yaml --region $REGION --capabilities CAPABILITY_IAM --stack-name $NETWORKNAME-peer-health-lambda \
--parameter-overrides NetworkId=$NETWORKID MemberId=$MEMBERID
