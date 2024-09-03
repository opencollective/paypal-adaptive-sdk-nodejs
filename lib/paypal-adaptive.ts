import * as https from 'https';
import * as util from 'util';
import { merge } from 'es-toolkit';

interface PaypalConfig {
  userId: string;
  password: string;
  signature: string;
  appId: string;
  requestFormat: string;
  responseFormat: string;
  sandbox?: boolean;
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
  data?: Record<string, unknown>;
}

class ErrorWithPaypalResponse extends Error {
  public response?: string;
  public httpStatusCode?: number | undefined;
}

function defaultPayload(): {
  requestEnvelope: { errorLanguage: string; detailLevel: string };
} & Record<string, unknown> {
  return {
    requestEnvelope: {
      errorLanguage: 'en_US',
      detailLevel: 'ReturnAll',
    },
  };
}

function httpsPost(
  options: HttpsOptions,
  callback: (
    error: ErrorWithPaypalResponse | null,
    response?: {
      statusCode?: number;
      body: string;
    },
  ) => void,
) {
  options.method = 'POST';
  options.headers = options.headers || {};

  const data = typeof options.data !== 'string' ? JSON.stringify(options.data) : options.data;

  options.headers['Content-Length'] = Buffer.byteLength(data).toString();

  const req = https.request(options);

  req.on('response', (res) => {
    let response = '';
    if (res.setEncoding) {
      res.setEncoding('utf8');
    }

    res.on('data', (chunk) => {
      response += chunk;
    });

    res.on('end', () => {
      callback(null, {
        statusCode: res.statusCode,
        body: response,
      });
    });
  });

  req.on('error', (e) => {
    callback(e as ErrorWithPaypalResponse);
  });

  if (data) {
    req.write(data);
  }

  req.end();
}

type RequiredUserPaypalConfig = Required<Pick<PaypalConfig, 'userId' | 'password' | 'signature'>> &
  Partial<PaypalConfig>;

class Paypal {
  private config: PaypalConfig;

  constructor(config: RequiredUserPaypalConfig) {
    if (!config) throw new Error('Config is required');
    if (!config.userId) throw new Error('Config must have userId');
    if (!config.password) throw new Error('Config must have password');
    if (!config.signature) throw new Error('Config must have signature');
    if (!config.appId && !config.sandbox) throw new Error('Config must have appId');

    const defaultConfig: Partial<PaypalConfig> = {
      requestFormat: 'JSON',
      responseFormat: 'JSON',
      sandbox: false,
      productionHostname: 'svcs.paypal.com',
      sandboxHostname: 'svcs.sandbox.paypal.com',
      appId: 'APP-80W284485P519543T',
      approvalUrl: 'https://www.paypal.com/cgi-bin/webscr?cmd=_ap-payment&paykey=%s',
      sandboxApprovalUrl: 'https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_ap-payment&paykey=%s',
      preapprovalUrl: 'https://www.paypal.com/webscr?cmd=_ap-preapproval&preapprovalkey=%s',
      sandboxPreapprovalUrl: 'https://www.sandbox.paypal.com/webscr?cmd=_ap-preapproval&preapprovalkey=%s',
    };

    this.config = merge(defaultConfig as PaypalConfig, config);
  }

  callApi(
    apiMethod: string,
    data: HttpsOptions['data'],
    callback: (error: ErrorWithPaypalResponse | null, response?: Record<string, unknown>) => void,
  ) {
    const config = this.config;

    const options: HttpsOptions = {
      hostname: (config.sandbox ? config.sandboxHostname : config.productionHostname) as string,
      port: 443,
      path: '/' + apiMethod,
      data: data,
      headers: {
        'X-PAYPAL-SECURITY-USERID': config.userId,
        'X-PAYPAL-SECURITY-PASSWORD': config.password,
        'X-PAYPAL-SECURITY-SIGNATURE': config.signature,
        'X-PAYPAL-APPLICATION-ID': config.appId,
        'X-PAYPAL-REQUEST-DATA-FORMAT': config.requestFormat,
        'X-PAYPAL-RESPONSE-DATA-FORMAT': config.responseFormat,
      },
    };

    if (config.sandboxEmailAddress) options.headers['X-PAYPAL-SANDBOX-EMAIL-ADDRESS'] = config.sandboxEmailAddress;

    if (config.deviceIpAddress) options.headers['X-PAYPAL-DEVICE-IPADDRESS'] = config.deviceIpAddress;

    if (config.subject) options.headers['X-PAYPAL-SECURITY-SUBJECT'] = config.subject;

    httpsPost(options, (error, response) => {
      if (error) {
        return callback(error);
      } else if (!response) {
        return callback(new Error('Empty response'));
      }

      const statusCode = response.statusCode;
      let parsedBody = null;
      if (config.responseFormat === 'JSON') {
        try {
          parsedBody = JSON.parse(response.body);
        } catch {
          const err = new ErrorWithPaypalResponse('Invalid JSON Response Received');
          err.response = response.body;
          err.httpStatusCode = response.statusCode;
          return callback(err);
        }
      }

      if (statusCode && (statusCode < 200 || statusCode >= 300)) {
        error = new ErrorWithPaypalResponse('Response Status: ' + statusCode);
        error.response = parsedBody || response.body;
        error.httpStatusCode = statusCode;
        return callback(error);
      }

      parsedBody.httpStatusCode = statusCode;

      if (/^(Success|SuccessWithWarning)$/.test(parsedBody.responseEnvelope.ack)) {
        callback(null, parsedBody);
      } else {
        const err = new Error(
          'Response ack is ' + parsedBody.responseEnvelope.ack + '. Check the response for more info',
        );
        return callback(err, parsedBody);
      }
    });
  }

  getPaymentOptions(payKey: string, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    if (!payKey) {
      return callback(new Error('Required "payKey"'));
    }

    const data = defaultPayload();
    data.payKey = payKey;

    this.callApi('AdaptivePayments/GetPaymentOptions', data, callback);
  }

  paymentDetails(params: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    if (!params.payKey && !params.transactionId && !params.trackingId) {
      return callback(new Error('Required "payKey" or "transactionId" or "trackingId" on first param'));
    }

    const data = merge(defaultPayload(), params);

    this.callApi('AdaptivePayments/PaymentDetails', data, callback);
  }

  pay(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    const config = this.config;

    this.callApi('AdaptivePayments/Pay', data, (err, res) => {
      if (err) {
        return callback(err, res);
      } else if (!res) {
        return callback(new Error('Empty response'));
      }

      if (res.paymentExecStatus === 'CREATED') {
        const url = config.sandbox ? config.sandboxApprovalUrl : config.approvalUrl;
        res.paymentApprovalUrl = util.format(url!, res.payKey);
      }

      return callback(null, res);
    });
  }

  preapproval(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    const config = this.config;

    this.callApi('AdaptivePayments/Preapproval', data, (err, res) => {
      if (err) {
        return callback(err, res);
      } else if (!res) {
        return callback(new Error('Empty response'));
      }

      if (res.preapprovalKey) {
        const url = config.sandbox ? config.sandboxPreapprovalUrl : config.preapprovalUrl;
        res.preapprovalUrl = util.format(url!, res.preapprovalKey);
      }

      return callback(null, res);
    });
  }

  refund(params: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    if (!params.payKey && !params.transactionId && !params.trackingId) {
      return callback(new Error('Required "payKey" or "transactionId" or "trackingId" on first param'));
    }

    const data = merge(defaultPayload(), params);

    this.callApi('AdaptivePayments/Refund', data, callback);
  }

  // Adaptive Payments Methods
  cancelPreapproval(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/CancelPreapproval', data, callback);
  }

  convertCurrency(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/ConvertCurrency', data, callback);
  }

  executePayment(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/ExecutePayment', data, callback);
  }

  getFundingPlans(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/GetFundingPlans', data, callback);
  }

  getShippingAddresses(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/GetShippingAddresses', data, callback);
  }

  preapprovalDetails(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/PreapprovalDetails', data, callback);
  }

  setPaymentOptions(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptivePayments/SetPaymentOptions', data, callback);
  }

  // Adaptive Accounts Methods
  addBankAccount(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/AddBankAccount', data, callback);
  }

  addPaymentCard(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/AddPaymentCard', data, callback);
  }

  checkComplianceStatus(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/CheckComplianceStatus', data, callback);
  }

  createAccount(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/CreateAccount', data, callback);
  }

  getUserAgreement(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/GetUserAgreement', data, callback);
  }

  getVerifiedStatus(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/GetVerifiedStatus', data, callback);
  }

  setFundingSourceConfirmed(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/SetFundingSourceConfirmed', data, callback);
  }

  updateComplianceStatus(data: any, callback: (error: Error | null, response?: Record<string, unknown>) => void) {
    this.callApi('AdaptiveAccounts/UpdateComplianceStatus', data, callback);
  }
}

export = Paypal;
