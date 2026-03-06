/**
 * Type declarations for the africastalking SDK.
 * The package does not include TypeScript types.
 */

declare module "africastalking" {
  interface ATConfig {
    apiKey: string;
    username: string;
  }

  interface SMSSendOptions {
    to: string[];
    message: string;
    from?: string;
  }

  interface SMSRecipient {
    status: string;
    number: string;
    cost: string;
    messageId: string;
  }

  interface SMSSendResult {
    SMSMessageData: {
      Message: string;
      Recipients: SMSRecipient[];
    };
  }

  interface SMS {
    send(options: SMSSendOptions): Promise<SMSSendResult>;
  }

  interface ATInstance {
    SMS: SMS;
  }

  function AfricasTalking(config: ATConfig): ATInstance;

  export default AfricasTalking;
}
