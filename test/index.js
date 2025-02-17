/* eslint-disable class-methods-use-this */

'use strict';

const { expect } = require('chai');
const sandbox = require('sinon').createSandbox();
const AWS = require('aws-sdk');

process.env.SSM_PARAMETERS_PATH = '/default-path/';
process.env.SSM_MAX_AGE = 10;

const parameterResolve = require('../');

function sleep(time) {
  return new Promise(resolve => setTimeout(() => resolve(), time));
}

describe('aws-ssm-parameter-resolve', () => {
  let defaultPathStub;
  let customPathStub;
  let ssmStub;
  before(() => {
    ssmStub = sandbox.stub(AWS.SSM.prototype, 'makeRequest');
  });

  beforeEach(async () => {
    defaultPathStub = ssmStub
      .withArgs('getParametersByPath', {
        Path: '/default-path/',
        WithDecryption: true,
        Recursive: true,
        NextToken: undefined,
      })
      .returns({
        promise: () =>
          Promise.resolve({
            Parameters: [
              {
                Name: '/default-path/ENDPOINT_KEY',
                Type: 'SecureString',
                Value: 'some-fii',
                Version: 1,
                LastModifiedDate: new Date(),
                ARN: 'arn:aws:ssm:eu-west-1:756207178743:parameter/default-path/ENDPOINT_KEY',
              },
              {
                Name: '/default-path/ENDPOINT_URL',
                Type: 'SecureString',
                Value: 'some-elo',
                Version: 1,
                LastModifiedDate: new Date(),
                ARN: 'arn:aws:ssm:eu-west-1:756207178743:parameter/default-path/ENDPOINT_URL',
              },
            ],
          }),
      });

    customPathStub = ssmStub
      .withArgs('getParametersByPath', {
        Path: '/custom-path/',
        WithDecryption: true,
        Recursive: true,
        NextToken: undefined,
      })
      .returns({
        promise: () =>
          Promise.resolve({
            Parameters: [
              {
                Name: '/custom-path/CUSTOM_KEY',
                Type: 'SecureString',
                Value: 'some-fii-custom',
                Version: 1,
                LastModifiedDate: new Date(),
                ARN: 'arn:aws:ssm:eu-west-1:756207178743:parameter/custom-path/ENDPOINT_KEY',
              },
              {
                Name: '/custom-path/ENDPOINT_URL',
                Type: 'CustomSecureString',
                Value: 'some-custom-elo',
                Version: 1,
                LastModifiedDate: new Date(),
                ARN: 'arn:aws:ssm:eu-west-1:756207178743:parameter/custom-path/ENDPOINT_URL',
              },
            ],
          }),
      });
  });

  afterEach(() => {
    defaultPathStub.reset();
    customPathStub.reset();
    parameterResolve.clear();
  });

  after(() => {
    sandbox.restore();
  });

  it('Should resolve secret values by default from SSM_PARAMETERS_PATH', async () => {
    const params = await parameterResolve();
    expect(params.get('ENDPOINT_KEY')).to.equal('some-fii');
    expect(params.get('ENDPOINT_URL')).to.equal('some-elo');
    await parameterResolve(); // call second time, should be cached
    expect(defaultPathStub.callCount).to.equal(1);
  });

  it('Should resolve secret values from custom path', async () => {
    const params = await parameterResolve('/custom-path/');
    expect(params.get('CUSTOM_KEY')).to.equal('some-fii-custom');
    expect(params.get('ENDPOINT_URL')).to.equal('some-custom-elo');
    await parameterResolve(); // call second time, should be cached
    expect(customPathStub.callCount).to.equal(1);
  });

  it('Should crash if secret is not resolved', async () => {
    const params = await parameterResolve();
    try {
      params.get('NOT_EXISTING');
      throw new Error('Not really');
    } catch (error) {
      expect(error.code).to.equal('SECRET_NOT_FOUND');
    }
    expect(defaultPathStub.callCount).to.equal(1);
  });

  it('Should fetch parameters from SSM twice because of max age', async () => {
    await parameterResolve();
    await parameterResolve();
    expect(defaultPathStub.callCount).to.equal(1);
    await sleep(30);
    await parameterResolve();
    expect(defaultPathStub.callCount).to.equal(2);
  });
});
