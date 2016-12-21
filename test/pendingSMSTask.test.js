const _ = require('lodash');
const serverDB = require('../src/utils/serverDB');
const Promise = require('bluebird');
const proxyquire = require('proxyquire');

let sendPendingSMS;

describe('sendPendingSMS spec', () => {

  let spy;

  beforeEach(() => {
    spy = jasmine.createSpy('sendMessage').and.callFake((data, cb) => cb());
    sendPendingSMS = proxyquire('../src/tasks/pendingSMSTask', {
      twilio: () => ({
        messages: {
          create: spy
        }
      })
    });
  });

  const mockSendSMS = numberToResultMap => {
    spy.and.callFake((smsDef, cb) => {
      if (numberToResultMap[smsDef.to]) {
        cb(null, { sid: 'SID_' + smsDef.to });
      } else {
        cb({ code: 400 });
      }
    });
  };

  const getSMSArgsFromSpy = () => _.map(spy.calls.allArgs(), argsForCall => _.first(argsForCall));

  it('should append +972 to phone numbers by default', done => {
    mockSendSMS({
      '+972501234567': true
    });

    serverDB.read.and.returnValue(Promise.resolve({
      smsId: {
        to: ['0501234567'],
        message: 'test message...'
      }
    }));

    sendPendingSMS.exec()
      .then(() => {
        expect(spy.calls.mostRecent().args[0].to).toEqual('+972501234567');
        done();
      });
  });

  it('should send sms from HapoelBus', done => {
    mockSendSMS({
      '+972501234567': true
    });

    serverDB.read.and.returnValue(Promise.resolve({
      smsId: {
        to: ['0501234567'],
        message: 'test message...'
      }
    }));

    sendPendingSMS.exec()
      .then(() => {
        expect(spy.calls.mostRecent().args[0].from).toEqual('HapoelBus');
        done();
      });
  });

  it('should send message as sms body', done => {
    mockSendSMS({
      '+972501234567': true
    });

    serverDB.read.and.returnValue(Promise.resolve({
      smsId: {
        to: ['0501234567'],
        message: 'test message...'
      }
    }));

    sendPendingSMS.exec()
      .then(() => {
        expect(spy.calls.mostRecent().args[0].body).toEqual('test message...');
        done();
      });
  });

  it('should send sms for multiple phone numbers', done => {
    mockSendSMS({
      '+972501234567': true,
      '+972991111111': true
    });

    serverDB.read.and.returnValue(Promise.resolve({
      smsId: {
        to: ['0501234567', '0991111111'],
        message: 'test message...'
      }
    }));

    sendPendingSMS.exec()
      .then(() => {
        expect(spy.calls.count()).toEqual(2);
        expect(getSMSArgsFromSpy()).toEqual([
          { to: '+972501234567', from: 'HapoelBus', body: 'test message...' },
          { to: '+972991111111', from: 'HapoelBus', body: 'test message...' }
        ]);
        done();
      });
  });

  it('should send multiple pending sms', done => {
    mockSendSMS({
      '+972501234567': true,
      '+972991111111': true,
      '+972857667984': true
    });

    serverDB.read.and.returnValue(Promise.resolve({
      smsId1: {
        to: ['0501234567', '0991111111'],
        message: 'test message 1...'
      },
      smsId2: {
        to: ['0857667984'],
        message: 'test message 2...'
      }
    }));

    sendPendingSMS.exec()
      .then(() => {
        expect(spy.calls.count()).toEqual(3);
        expect(getSMSArgsFromSpy()).toEqual([
          { to: '+972501234567', from: 'HapoelBus', body: 'test message 1...' },
          { to: '+972991111111', from: 'HapoelBus', body: 'test message 1...' },
          { to: '+972857667984', from: 'HapoelBus', body: 'test message 2...' }
        ]);
        done();
      });
  });

  it('should remove sms from pending list', done => {
    mockSendSMS({
      '+972501234567': true,
      '+972991111111': true
    });

    serverDB.read.and.returnValue(Promise.resolve({
      smsId1: {
        to: ['0501234567', '0991111111'],
        message: 'test message 1...'
      }
    }));

    sendPendingSMS.exec()
      .then(() => {
        expect(serverDB.remove).toHaveBeenCalledWith('pendingSMS/smsId1');
        done();
      });
  });

  describe('send sms failed', () => {

    it('should not remove pending sms', done => {
      mockSendSMS({
        '+972501234567': false
      });

      serverDB.read.and.returnValue(Promise.resolve({
        smsId1: {
          to: ['0501234567'],
          message: 'test message 1...'
        }
      }));

      sendPendingSMS.exec()
        .then(() => {
          expect(serverDB.remove).not.toHaveBeenCalledWith('pendingSMS/smsId1');
          done();
        });
    });

    it('should replace the numbers to send in DB with the numbers that failed to receive sms', done => {
      mockSendSMS({
        '+972501234565': true,
        '+972501234566': false,
        '+972501234567': false,
        '+972501234568': true,
        '+972501234569': false
      });

      serverDB.read.and.returnValue(Promise.resolve({
        smsId1: {
          to: ['0501234565', '0501234566', '0501234567', '0501234568', '0501234569'],
          message: 'test message 1...'
        }
      }));

      sendPendingSMS.exec()
        .then(() => {
          expect(serverDB.remove).not.toHaveBeenCalledWith('pendingSMS/smsId1');
          expect(serverDB.setIn).toHaveBeenCalledWith('pendingSMS/smsId1/to', ['0501234566', '0501234567', '0501234569']);
          done();
        });
    });

    it('should not change the numbers to send if all of the numbers failed to receive sms', done => {
      mockSendSMS({
        '+972501234565': false,
        '+972501234566': false,
        '+972501234567': false,
        '+972501234568': false,
        '+972501234569': false
      });

      serverDB.read.and.returnValue(Promise.resolve({
        smsId1: {
          to: ['0501234565', '0501234566', '0501234567', '0501234568', '0501234569'],
          message: 'test message 1...'
        }
      }));

      sendPendingSMS.exec()
        .then(() => {
          expect(serverDB.remove).not.toHaveBeenCalledWith('pendingSMS/smsId1');
          expect(serverDB.setIn).not.toHaveBeenCalledWith('pendingSMS/smsId1/to');
          done();
        });
    });

  });

});