import * as https from "https";
import * as util from "util";
import { merge } from "es-toolkit";

interface PaypalConfig {
  userId: string;
  password: string;
  signature: string;
  appId?: string;
  sandbox?: boolean;
  requestFormat?: string;
  responseFormat?: string;
  productionHostname?: string;
  sandboxHostname?: string;
  approvalUrl?: string;
  sandboxApprovalUrl?: string;
  preapprovalUrl?: string;
  sandboxPreapprovalUrl?: string;
  sandboxEmailAddress?: string;
  deviceIpAddress?: string;
  subject?: string;
}

interface HttpsOptions {
  hostname: string;
  port: number;
  path: string;
  method?: string;
  headers: Record<string, string>;
  data?: any;
}

function defaultPayload() {
  return {
    requestEnvelope: {
      errorLanguage: "en_US",
      detailLevel: "ReturnAll",
    },
  };
}

function httpsPost(
  options: HttpsOptions,
  callback: (error: Error | null, response?: any) => void
) {
  options.method = "POST";
  options.headers = options.headers || {};

  const data =
    typeof options.data !== "string"
      ? JSON.stringify(options.data)
      : options.data;

  options.headers["Content-Length"] = Buffer.byteLength(data).toString();

  const req = https.request(options);

  req.on("response", (res) => {
    let response = "";
    if (res.setEncoding) {
      res.setEncoding("utf8");
    }

    res.on("data", (chunk) => {
      response += chunk;
    });

    res.on("end", () => {
      callback(null, {
        statusCode: res.statusCode,
        body: response,
      });
    });
  });

  req.on("error", (e) => {
    callback(e);
  });

  if (data) {
    req.write(data);
  }

  req.end();
}

class Paypal {
  private config: PaypalConfig;

  constructor(config: PaypalConfig) {
    if (!config) throw new Error("Config is required");
    if (!config.userId) throw new Error("Config must have userId");
    if (!config.password) throw new Error("Config must have password");
    if (!config.signature) throw new Error("Config must have signature");
    if (!config.appId && !config.sandbox)
      throw new Error("Config must have appId");

    const defaultConfig: Partial<PaypalConfig> = {
      requestFormat: "JSON",
      responseFormat: "JSON",
      sandbox: false,
      productionHostname: "svcs.paypal.com",
      sandboxHostname: "svcs.sandbox.paypal.com",
      appId: "APP-80W284485P519543T",
      approvalUrl:
        "https://www.paypal.com/cgi-bin/webscr?cmd=_ap-payment&paykey=%s",
      sandboxApprovalUrl:
        "https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_ap-payment&paykey=%s",
      preapprovalUrl:
        "https://www.paypal.com/webscr?cmd=_ap-preapproval&preapprovalkey=%s",
      sandboxPreapprovalUrl:
        "https://www.sandbox.paypal.com/webscr?cmd=_ap-preapproval&preapprovalkey=%s",
    };

    this.config = merge(defaultConfig as PaypalConfig, config);
  }

  callApi(
    apiMethod: string,
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    const config = this.config;

    const options: HttpsOptions = {
      hostname: (config.sandbox
        ? config.sandboxHostname
        : config.productionHostname) as string,
      port: 443,
      path: "/" + apiMethod,
      data: data,
      headers: {
        "X-PAYPAL-SECURITY-USERID": config.userId,
        "X-PAYPAL-SECURITY-PASSWORD": config.password,
        "X-PAYPAL-SECURITY-SIGNATURE": config.signature,
        "X-PAYPAL-APPLICATION-ID": config.appId!,
        "X-PAYPAL-REQUEST-DATA-FORMAT": config.requestFormat!,
        "X-PAYPAL-RESPONSE-DATA-FORMAT": config.responseFormat!,
      },
    };

    if (config.sandboxEmailAddress)
      options.headers["X-PAYPAL-SANDBOX-EMAIL-ADDRESS"] =
        config.sandboxEmailAddress;

    if (config.deviceIpAddress)
      options.headers["X-PAYPAL-DEVICE-IPADDRESS"] = config.deviceIpAddress;

    if (config.subject)
      options.headers["X-PAYPAL-SECURITY-SUBJECT"] = config.subject;

    httpsPost(options, (error, response) => {
      if (error) {
        return callback(error);
      }

      let body = response.body;
      const statusCode = response.statusCode;

      if (config.responseFormat === "JSON") {
        try {
          body = JSON.parse(body);
        } catch (e) {
          const err = new Error("Invalid JSON Response Received");
          (err as any).response = body;
          (err as any).httpStatusCode = response.statusCode;
          return callback(err);
        }
      }

      if (statusCode < 200 || statusCode >= 300) {
        error = new Error("Response Status: " + statusCode);
        (error as any).response = body;
        (error as any).httpStatusCode = statusCode;
        return callback(error);
      }

      (body as any).httpStatusCode = statusCode;

      if (
        /^(Success|SuccessWithWarning)$/.test(
          (body as any).responseEnvelope.ack
        )
      ) {
        callback(null, body);
      } else {
        const err = new Error(
          "Response ack is " +
            (body as any).responseEnvelope.ack +
            ". Check the response for more info"
        );
        return callback(err, body);
      }
    });
  }

  getPaymentOptions(
    payKey: string,
    callback: (error: Error | null, response?: any) => void
  ) {
    if (!payKey) {
      return callback(new Error('Required "payKey"'));
    }

    const data = defaultPayload();
    (data as any).payKey = payKey;

    this.callApi("AdaptivePayments/GetPaymentOptions", data, callback);
  }

  paymentDetails(
    params: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    if (!params.payKey && !params.transactionId && !params.trackingId) {
      return callback(
        new Error(
          'Required "payKey" or "transactionId" or "trackingId" on first param'
        )
      );
    }

    const data = merge(defaultPayload(), params);

    this.callApi("AdaptivePayments/PaymentDetails", data, callback);
  }

  pay(data: any, callback: (error: Error | null, response?: any) => void) {
    const config = this.config;

    this.callApi("AdaptivePayments/Pay", data, (err, res) => {
      if (err) {
        return callback(err, res);
      }

      if ((res as any).paymentExecStatus === "CREATED") {
        const url = config.sandbox
          ? config.sandboxApprovalUrl
          : config.approvalUrl;
        (res as any).paymentApprovalUrl = util.format(
          url!,
          (res as any).payKey
        );
      }

      return callback(null, res);
    });
  }

  preapproval(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    const config = this.config;

    this.callApi("AdaptivePayments/Preapproval", data, (err, res) => {
      if (err) {
        return callback(err, res);
      }

      if ((res as any).preapprovalKey) {
        const url = config.sandbox
          ? config.sandboxPreapprovalUrl
          : config.preapprovalUrl;
        (res as any).preapprovalUrl = util.format(
          url!,
          (res as any).preapprovalKey
        );
      }

      return callback(null, res);
    });
  }

  refund(params: any, callback: (error: Error | null, response?: any) => void) {
    if (!params.payKey && !params.transactionId && !params.trackingId) {
      return callback(
        new Error(
          'Required "payKey" or "transactionId" or "trackingId" on first param'
        )
      );
    }

    const data = merge(defaultPayload(), params);

    this.callApi("AdaptivePayments/Refund", data, callback);
  }

  // Adaptive Payments Methods
  cancelPreapproval(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/CancelPreapproval", data, callback);
  }

  convertCurrency(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/ConvertCurrency", data, callback);
  }

  executePayment(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/ExecutePayment", data, callback);
  }

  getFundingPlans(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/GetFundingPlans", data, callback);
  }

  getShippingAddresses(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/GetShippingAddresses", data, callback);
  }

  preapprovalDetails(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/PreapprovalDetails", data, callback);
  }

  setPaymentOptions(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptivePayments/SetPaymentOptions", data, callback);
  }

  // Adaptive Accounts Methods
  addBankAccount(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/AddBankAccount", data, callback);
  }

  addPaymentCard(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/AddPaymentCard", data, callback);
  }

  checkComplianceStatus(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/CheckComplianceStatus", data, callback);
  }

  createAccount(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/CreateAccount", data, callback);
  }

  getUserAgreement(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/GetUserAgreement", data, callback);
  }

  getVerifiedStatus(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/GetVerifiedStatus", data, callback);
  }

  setFundingSourceConfirmed(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/SetFundingSourceConfirmed", data, callback);
  }

  updateComplianceStatus(
    data: any,
    callback: (error: Error | null, response?: any) => void
  ) {
    this.callApi("AdaptiveAccounts/UpdateComplianceStatus", data, callback);
  }
}

export = Paypal;
