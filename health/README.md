# Health check the Managed Blockchain peer nodes

In this section we will deploy a Lambda function that checks the health of the Amazon Managed Blockchain peer nodes.
The Lambda function will return success if all the peer nodes in the Fabric network are AVAILABLE, otherwise it will
return an error. It will ignore peer nodes that have a status of CREATING, DELETING or DELETED. 

An error from the Lambda will result in a CloudWatch alarm and an SNS notification routed to an email address. The 
Lambda will be automatically invoked by a CloudWatch scheduled event. Ideally, the CloudWatch alarm would indicate
the Managed Blockchain network with the failed peer. However, adding a dimension to the alarm causes the alarm to 
remain in an 'Insufficient data' status, and the alarm is never triggered. I haven't investigated this fully, but 
the added dimension seems to cause a mismatch between the CloudWatch metric and the associated alarm.

In multi-member networks the peer-health check would typically run in each AWS account, providing notifications to 
each account owner. Notifications would be provided regardless of the account owning the failed peer. This makes sense
as transactions are typically sent to peers owned by other members for endorsement, so a member would need to know if
other peer nodes owned by other members had failed.

The Lambda also creates CloudWatch custom metrics and CloudWatch alarms per peer node (custom metrics incur a cost, see [here](https://aws.amazon.com/cloudwatch/pricing)). If the peer node is AVAILABLE, the alarm status will be set to OK, otherwise it will be set to ALARM. This is to allow notifications per peer node, and possibly a recovery process per peer that fails. If a single alarm was used for the entire Managed Blockchain network, it would  transition from OK->Alarm for the first failed peer, and there would be no further transition if a second peer node failed while in the Alarm state. The result would be a single notification regardless of how many peer nodes fail while the alarm was in the Alarm state. Alarms per peer node allow multiple concurrent alarms for the same network.

CloudFormation and the Serverless Application Model (SAM) is used to package and deploy the Lambda function. More details on SAM can be found here: https://aws.amazon.com/serverless/sam/, however, note that I'm not using the SAM CLI but rather the equivalent `aws cloudformation` commands.

## Pre-requisites

From Cloud9, SSH into the Fabric client node. The key (i.e. the .PEM file) should be in your home directory. 
The DNS of the Fabric client node EC2 instance can be found in the output of the AWS CloudFormation stack you 
created in [Part 1](../ngo-fabric/README.md)

```
ssh ec2-user@<dns of EC2 instance> -i ~/<Fabric network name>-keypair.pem
```

You should have already cloned this repo in [Part 1](../ngo-fabric/README.md)

```
cd ~
git clone https://github.com/aws-samples/non-profit-blockchain.git
```

You will need to set the context before carrying out any Fabric CLI commands. We do this 
using the export files that were generated for us in [Part 1](../ngo-fabric/README.md)

Source the file, so the exports are applied to your current session. If you exit the SSH 
session and re-connect, you'll need to source the file again. The `source` command below
will print out the values of the key ENV variables. Make sure they are all populated. If
they are not, follow Step 4 in [Part 1](../ngo-fabric/README.md) to repopulate them:

```
cd ~/non-profit-blockchain/ngo-fabric
source fabric-exports.sh
source ~/peer-exports.sh 
```

You will need an environment variable pointing to an email address. In the CloudFormation template (template.yaml), the SNS topic expects an email subscription.

```
export SNSEMAIL=youremail@yourdomain.com
```

## Overview
The CloudFormation template is named `peer-health-template.yaml`. It will create the Lambda, the CW scheduled event, the SNS topic and the email subscription. Before creating the CloudFormation stack, update the BUCKETNAME in `create-lambda.sh` to be a unique bucket name:

```
cd ~/non-profit-blockchain/health
./create-lambda.sh
```

Check the CloudFormation console for the status of the stack.

You can test the Lambda function using the [Lambda console](https://console.aws.amazon.com/lambda). A test event can be found
in the folder peer-health/events. Update this to match your Fabric network and member IDs.