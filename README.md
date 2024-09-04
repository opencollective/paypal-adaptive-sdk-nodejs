# Adaptive Payments and Adaptive Accounts SDK

Node.js sdk for Paypal Adaptive Payments and Paypal Adaptive Accounts APIs. Forked from https://github.com/Ideame/paypal-adaptive-sdk-nodejs
and updated with CI and security fixes. Backward compatible with the original sdk.

## Usage

- Add dependency 'paypal-adaptive' in your package.json file.
- Require 'paypal-adaptive' in your file.

  ```js
  var Paypal = require("paypal-adaptive");

  var paypalSdk = new Paypal({
    userId: "userId",
    password: "password",
    signature: "signature",
    sandbox: true, //defaults to false
  });
  ```

- Call to sdk methods or to the generic method callApi. If you get an error, you can check the response too for better error handling.

  ```js
  var requestData = {
    requestEnvelope: {
      errorLanguage: "en_US",
      detailLevel: "ReturnAll",
    },
    payKey: "AP-1234567890",
  };

  paypalSdk.callApi(
    "AdaptivePayments/PaymentDetails",
    requestData,
    function (err, response) {
      if (err) {
        // You can see the error
        console.log(err);
        //And the original Paypal API response too
        console.log(response);
      } else {
        // Successful response
        console.log(response);
      }
    }
  );
  ```

### API

#### GetPaymentOptions

```js
var payKey = "AP-1234567890";

paypalSdk.getPaymentOptions(payKey, function (err, response) {
  if (err) {
    console.log(err);
  } else {
    // payments options for this payKey
    console.log(response);
  }
});
```

#### PaymentDetails

```js
// One of this params is required
// The payKey
var params = {
  payKey: "AP-1234567890",
};
// Or the transactionId
var params = {
  transactionId: "AP-1234567890",
};
// Or the trackingId
var params = {
  trackingId: "AP-1234567890",
};

paypalSdk.paymentDetails(params, function (err, response) {
  if (err) {
    console.log(err);
  } else {
    // payments details for this payKey, transactionId or trackingId
    console.log(response);
  }
});
```

#### Pay

```js
var payload = {
  requestEnvelope: {
    errorLanguage: "en_US",
  },
  actionType: "PAY",
  currencyCode: "USD",
  feesPayer: "EACHRECEIVER",
  memo: "Chained payment example",
  cancelUrl: "http://test.com/cancel",
  returnUrl: "http://test.com/success",
  receiverList: {
    receiver: [
      {
        email: "primary@test.com",
        amount: "100.00",
        primary: "true",
      },
      {
        email: "secondary@test.com",
        amount: "10.00",
        primary: "false",
      },
    ],
  },
};

paypalSdk.pay(payload, function (err, response) {
  if (err) {
    console.log(err);
  } else {
    // Response will have the original Paypal API response
    console.log(response);
    // But also a paymentApprovalUrl, so you can redirect the sender to checkout easily
    console.log("Redirect to %s", response.paymentApprovalUrl);
  }
});
```

#### Preapproval

```js
var payload = {
  currencyCode: "USD",
  startingDate: new Date().toISOString(),
  endingDate: new Date("2020-01-01").toISOString(),
  returnUrl: "http://your-website.com",
  cancelUrl: "http://your-website.com",
  ipnNotificationUrl: "http://your-ipn-listener.com",
  maxNumberOfPayments: 1,
  displayMaxTotalAmount: true,
  maxTotalAmountOfAllPayments: "100.00",
  requestEnvelope: {
    errorLanguage: "en_US",
  },
};

paypalSdk.preapproval(payload, function (err, response) {
  if (err) {
    console.log(err);
  } else {
    // Response will have the original Paypal API response
    console.log(response);
    // But also a preapprovalUrl, so you can redirect the sender to approve the payment easily
    console.log("Redirect to %s", response.preapprovalUrl);
  }
});
```

**Note:**
The other API methods has default behavior by now: you send a payload and obtains the Paypal original response.

```js
var payload = {
  requestEnvelope: {
    errorLanguage: "en_US",
  },
  // another data required by API method
};

var callback = function (err, response) {
  if (err) {
    // Handle error
    console.log(err);
  } else {
    // Paypal response
    console.log(response);
  }
};

// For Adaptive Payments
paypalSdk.cancelPreapproval(payload, callback);

paypalSdk.convertCurrency(payload, callback);

paypalSdk.executePayment(payload, callback);

paypalSdk.getFundingPlans(payload, callback);

paypalSdk.getShippingAddresses(payload, callback);

paypalSdk.preapprovalDetails(payload, callback);

paypalSdk.setPaymentOptions(payload, callback);

// For Adaptive Accounts
paypalSdk.addBankAccount(payload, callback);

paypalSdk.addPaymentCard(payload, callback);

paypalSdk.checkComplianceStatus(payload, callback);

paypalSdk.createAccount(payload, callback);
// To use this method you can set X-PAYPAL-SANDBOX-EMAIL-ADDRESS and X-PAYPAL-DEVICE-IPADDRESS headers passing 'sandboxEmailAddress' and 'deviceIpAddress' properties on config

paypalSdk.getUserAgreement(payload, callback);

paypalSdk.getVerifiedStatus(payload, callback);

paypalSdk.setFundingSourceConfirmed(payload, callback);

paypalSdk.updateComplianceStatus(payload, callback);
```

## Development

### Tests

Tests can be ran with:

```sh
npm test
```

### Release

To release a new version, you need to:

1. Increment version with `npm version patch` (or minor or major)
2. Push changes to the repository
3. Publish the new version to npm with `npm publish`

## Reference

PayPal adaptive documentation is mostly down by now, but you can check:

- https://developer.paypal.com/api/nvp-soap/adaptive-platform/
- http://web.archive.org/web/20150905135740/https://developer.paypal.com/webapps/developer/docs/classic/api/

## License

Copyright (c) 2014 Gonzalo Aguirre. See the LICENSE file for license rights and limitations (MIT).
