import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { CfnEventDataStore } from "aws-cdk-lib/aws-cloudtrail";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

export interface ExampleBucketStackProps extends StackProps {
  /**
   * If true indicates that this is a development bucket that
   * may have looser restrictions on deletion etc.
   */
  readonly isDevelopment?: boolean;

  /**
   * The name of the bucket that we want to create.
   */
  readonly bucketName: string;
}

/**
 * A stack deploying a bucket and cloudtrail etc that can be used for example data.
 */
export class ExampleBucketStack extends Stack {
  constructor(scope: Construct, id: string, props: ExampleBucketStackProps) {
    super(scope, id, props);

    // bucket we can fill with example data
    const bucket = new Bucket(this, "Bucket", {
      bucketName: props.bucketName,
      removalPolicy: props.isDevelopment
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      autoDeleteObjects: props.isDevelopment,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: Duration.days(1),
          enabled: true,
        },
      ],
    });

    bucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["*"],
        principals: [new AnyPrincipal()],
        resources: [bucket.bucketArn, bucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "s3:DataAccessPointAccount": Stack.of(this).account,
          },
        },
      })
    );

    // CloudTrail logs
    const cfnEventDataStore = new CfnEventDataStore(
      this,
      "CloudTrailEventDataStore",
      {
        advancedEventSelectors: [
          {
            fieldSelectors: [
              {
                field: "eventCategory",
                equalTo: ["Data"],
              },
              {
                field: "resources.type",
                equalTo: ["AWS::S3::Object"],
              },
              {
                field: "resources.ARN",
                startsWith: [bucket.bucketArn],
              },
              {
                field: "eventName",
                equalTo: ["GetObject"],
              },
            ],

            name: "read-access-s3",
          },
        ],
        multiRegionEnabled: false,
        organizationEnabled: false,
        retentionPeriod: props.isDevelopment
          ? 30 /* keep for a month (only for demo) */
          : 365,
        terminationProtectionEnabled: false,
      }
    );

    // Output value
    new CfnOutput(this, "CloudTrailLakeArnOutput", {
      value: cfnEventDataStore.attrEventDataStoreArn,
      description: "The ARN for CloudTrail Lake",
      exportName: "CloudTrailLakeArn",
    });
  }
}
