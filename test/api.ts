import nock from 'nock';
import assert from 'assert';
import Paypal from '../lib/paypal-adaptive';

const paypalConfig = {
  userId: 'mockUserId',
  password: 'mockPassword',
  signature: 'mockSignature',
  sandbox: true,
};

describe('callApi method', () => {
  it('should POST with correct header', (done) => {
    const mockResponse = { jjx: 'jjx' };

    const mockHttp = nock('https://svcs.sandbox.paypal.com')
      .matchHeader('X-PAYPAL-SECURITY-USERID', 'mockUserId')
      .matchHeader('X-PAYPAL-SECURITY-PASSWORD', 'mockPassword')
      .matchHeader('X-PAYPAL-SECURITY-SIGNATURE', 'mockSignature')
      .matchHeader('X-PAYPAL-APPLICATION-ID', 'APP-80W284485P519543T')
      .matchHeader('X-PAYPAL-REQUEST-DATA-FORMAT', 'JSON')
      .matchHeader('X-PAYPAL-RESPONSE-DATA-FORMAT', 'JSON')
      .post('/just-for-check-header', {})
      .reply(400, mockResponse);

    const api = new Paypal(paypalConfig);

    api.callApi('just-for-check-header', {}, (err) => {
      assert.notEqual(err, null);
      assert.equal(err?.httpStatusCode, 400);
      assert.deepEqual(err?.response, mockResponse);

      mockHttp.done();
      done();
    });
  });

  it('should POST with header additional headers X-PAYPAL-SANDBOX-EMAIL-ADDRESS and X-PAYPAL-DEVICE-IPADDRESS if were provided on config', (done) => {
    const mockResponse = { jjx: 'jjx' };

    const mockHttp = nock('https://svcs.sandbox.paypal.com')
      .matchHeader('X-PAYPAL-SECURITY-USERID', 'mockUserId')
      .matchHeader('X-PAYPAL-SECURITY-PASSWORD', 'mockPassword')
      .matchHeader('X-PAYPAL-SECURITY-SIGNATURE', 'mockSignature')
      .matchHeader('X-PAYPAL-APPLICATION-ID', 'APP-80W284485P519543T')
      .matchHeader('X-PAYPAL-REQUEST-DATA-FORMAT', 'JSON')
      .matchHeader('X-PAYPAL-RESPONSE-DATA-FORMAT', 'JSON')
      .matchHeader('X-PAYPAL-SANDBOX-EMAIL-ADDRESS', 'mockEmailAddress')
      .matchHeader('X-PAYPAL-DEVICE-IPADDRESS', 'mockIpAddress')
      .post('/just-for-check-extra-headers', {})
      .reply(400, mockResponse);

    const api = new Paypal({
      userId: 'mockUserId',
      password: 'mockPassword',
      signature: 'mockSignature',
      sandbox: true,
      sandboxEmailAddress: 'mockEmailAddress',
      deviceIpAddress: 'mockIpAddress',
    });

    api.callApi('just-for-check-extra-headers', {}, (err) => {
      assert.equal(err?.httpStatusCode, 400);
      assert.deepEqual(err?.response, mockResponse);

      mockHttp.done();
      done();
    });
  });

  it('should return error when status is not 200', (done) => {
    const mockResponse = { jjx: 'jjx' };

    const mockHttp = nock('https://svcs.sandbox.paypal.com').post('/not-200', {}).reply(400, mockResponse);

    const api = new Paypal(paypalConfig);

    api.callApi('not-200', {}, (err) => {
      assert.equal(err?.httpStatusCode, 400);
      assert.deepEqual(err?.response, mockResponse);

      mockHttp.done();
      done();
    });
  });

  it('should return error when Paypal response ack is not Success or SuccessWithWarning', (done) => {
    const failureResponse = {
      responseEnvelope: { ack: 'NotSuccess' },
      error: 'errorMock',
    } as {
      responseEnvelope: { ack: string };
      error: string;
      httpStatusCode?: number;
    };

    const mockHttp = nock('https://svcs.sandbox.paypal.com').post('/failure-response', {}).reply(200, failureResponse);

    const api = new Paypal(paypalConfig);

    api.callApi('failure-response', {}, (err, res) => {
      assert.notEqual(err, null);

      failureResponse.httpStatusCode = 200;
      assert.deepEqual(res, failureResponse);

      mockHttp.done();
      done();
    });
  });

  it('should return OK when Paypal response ack is Success', (done) => {
    const okResponse = {
      responseEnvelope: { ack: 'Success' },
      mock: 'mock',
    } as {
      responseEnvelope: { ack: string };
      mock: string;
      httpStatusCode?: number;
    };

    const mockHttp = nock('https://svcs.sandbox.paypal.com').post('/ok-response', {}).reply(200, okResponse);

    const api = new Paypal(paypalConfig);

    api.callApi('ok-response', {}, (err, res) => {
      assert.equal(err, null);

      okResponse.httpStatusCode = 200;
      assert.deepEqual(res, okResponse);

      mockHttp.done();
      done();
    });
  });

  it('should return OK when Paypal response ack is SuccessWithWarning', (done) => {
    const okResponse = {
      responseEnvelope: { ack: 'SuccessWithWarning' },
      mock: 'mock',
    } as {
      responseEnvelope: { ack: string };
      mock: string;
      httpStatusCode?: number;
    };

    const mockHttp = nock('https://svcs.sandbox.paypal.com').post('/ok-response', {}).reply(200, okResponse);

    const api = new Paypal(paypalConfig);

    api.callApi('ok-response', {}, (err, res) => {
      assert.equal(err, null);

      okResponse.httpStatusCode = 200;
      assert.deepEqual(res, okResponse);

      mockHttp.done();
      done();
    });
  });
});
