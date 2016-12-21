const _ = require('lodash');
const nock = require('nock');
const serverDB = require('../src/utils/serverDB');

const pendingEmailsTask = require('../src/tasks/pendingEmailsTask');

describe('sendPendingEmails spec', () => {

    beforeEach(() => {
        spyOn(console, 'log');
        nock.cleanAll();
    });

    const mockSendGrid = (responseCode, onRequest, times) => {
        nock('https://api.sendgrid.com')
            .post('/v3/mail/send', body => {
                if (_.isFunction(onRequest)) {
                    onRequest(body);
                }
                return true;
            })
            .times(times || 1)
            .reply(responseCode);
    };

    const mockPendingEmailsRead = (pendingTemplates, pendingCustom) => {
        serverDB.read.and.callFake(path => {
            switch (path) {
                case 'pendingEmails/templates':
                    return Promise.resolve(pendingTemplates);
                case 'pendingEmails/custom':
                    return Promise.resolve(pendingCustom);
                default:
                    return Promise.resolve(null);
            }
        });
    };

    describe('pending templates', () => {

        it('should not send email if there is no pending templates', done => {
            let isSendGridCalled = false;

            mockPendingEmailsRead(null);
            mockSendGrid(202, () => {
                isSendGridCalled = true;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(isSendGridCalled).toBe(false);
                    expect(serverDB.remove).not.toHaveBeenCalled();
                    done();
                });
        });

        it('should send email without substitutions', done => {
            let sendGridBody = {};
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com'],
                    templateId: 'someTemplateId'
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(202, body => {
                sendGridBody = body;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBody.personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBody.personalizations[0].substitutions).toEqual({});
                    expect(sendGridBody.template_id).toEqual('someTemplateId');
                    done();
                });
        });

        it('should send email with substitutions', done => {
            let sendGridBody = {};
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com'],
                    templateId: 'someTemplateId',
                    substitutions: { '-VS-': 'Hapoel Spider Pig' }
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(202, body => {
                sendGridBody = body;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBody.personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBody.personalizations[0].substitutions).toEqual({ '-VS-': 'Hapoel Spider Pig' });
                    expect(sendGridBody.template_id).toEqual('someTemplateId');
                    done();
                });
        });

        it('should send email with multiple recipients', done => {
            let sendGridBody = {};
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com', 'spider@pig.com'],
                    templateId: 'someTemplateId'
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(202, body => {
                sendGridBody = body;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBody.personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBody.personalizations[0].substitutions).toEqual({});
                    expect(sendGridBody.personalizations[1].to).toEqual([{ email: 'spider@pig.com' }]);
                    expect(sendGridBody.personalizations[1].substitutions).toEqual({});
                    expect(sendGridBody.template_id).toEqual('someTemplateId');
                    done();
                });
        });

        it('should send multiple mails', done => {
            const sendGridBodyCalls = [];
            const pendingTemplates = {
                mailId1: {
                    recipients: ['test@example.com'],
                    templateId: 'someTemplateId'
                },
                mailId2: {
                    recipients: ['spider@pig.com'],
                    templateId: 'someTemplateId2'
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(202, body => sendGridBodyCalls.push(body), 2);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBodyCalls.length).toEqual(2);

                    expect(sendGridBodyCalls[0].personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBodyCalls[0].personalizations[0].substitutions).toEqual({});
                    expect(sendGridBodyCalls[0].template_id).toEqual('someTemplateId');

                    expect(sendGridBodyCalls[1].personalizations[0].to).toEqual([{ email: 'spider@pig.com' }]);
                    expect(sendGridBodyCalls[1].personalizations[0].substitutions).toEqual({});
                    expect(sendGridBodyCalls[1].template_id).toEqual('someTemplateId2');
                    done();
                });
        });

        it('should skip invalid recipients', done => {
            let sendGridBody = {};
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com', '', undefined, 'nonValid@email', 'spider@pig.com', null],
                    templateId: 'someTemplateId'
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(202, body => {
                sendGridBody = body;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBody.personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBody.personalizations[0].substitutions).toEqual({});
                    expect(sendGridBody.personalizations[1].to).toEqual([{ email: 'spider@pig.com' }]);
                    expect(sendGridBody.personalizations[1].substitutions).toEqual({});
                    expect(sendGridBody.template_id).toEqual('someTemplateId');
                    done();
                });
        });

        it('should remove mail from db after success sending', done => {
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com'],
                    templateId: 'someTemplateId'
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(202);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(serverDB.remove).toHaveBeenCalledWith('pendingEmails/templates/mailId');
                    done();
                });
        });

        it('should NOT remove mail from db if sending mail failed', done => {
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com'],
                    templateId: 'someTemplateId'
                }
            };

            mockPendingEmailsRead(pendingTemplates);
            mockSendGrid(400);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(serverDB.remove).not.toHaveBeenCalled();
                    done();
                });
        });

    });

    describe('pending custom mails', () => {

        it('should not send email if there is no pending custom mails', done => {
            let isSendGridCalled = false;

            mockPendingEmailsRead(null, null);
            mockSendGrid(202, () => {
                isSendGridCalled = true;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(isSendGridCalled).toBe(false);
                    expect(serverDB.remove).not.toHaveBeenCalled();
                    done();
                });
        });

        it('should send email with multiple recipients', done => {
            let sendGridBody = {};
            const customMails = {
                mailId: {
                    recipients: ['test@example.com', 'spider@pig.com'],
                    subject: 'Can He Swing?',
                    content: '<h1>From A Web</h1>'
                }
            };

            mockPendingEmailsRead(null, customMails);
            mockSendGrid(202, body => {
                sendGridBody = body;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBody.personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBody.personalizations[0].subject).toEqual('Can He Swing?');
                    expect(sendGridBody.personalizations[1].to).toEqual([{ email: 'spider@pig.com' }]);
                    expect(sendGridBody.personalizations[1].subject).toEqual('Can He Swing?');
                    expect(sendGridBody.content).toEqual([{ type: 'text/html', value: '<h1>From A Web</h1>' }]);
                    done();
                });
        });

        it('should send multiple mails', done => {
            const sendGridBodyCalls = [];
            const customMails = {
                mailId1: {
                    recipients: ['test@example.com'],
                    subject: 'Can He Swing?',
                    content: '<h1>From A Web</h1>'
                },
                mailId2: {
                    recipients: ['spider@pig.com'],
                    subject: 'No He Can\'t!',
                    content: '<h1>He is a pig!</h1>'
                }
            };

            mockPendingEmailsRead(null, customMails);
            mockSendGrid(202, body => sendGridBodyCalls.push(body), 2);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBodyCalls.length).toEqual(2);

                    expect(sendGridBodyCalls[0].personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBodyCalls[0].personalizations[0].subject).toEqual('Can He Swing?');
                    expect(sendGridBodyCalls[0].content).toEqual([{ type: 'text/html', value: '<h1>From A Web</h1>' }]);

                    expect(sendGridBodyCalls[1].personalizations[0].to).toEqual([{ email: 'spider@pig.com' }]);
                    expect(sendGridBodyCalls[1].personalizations[0].subject).toEqual('No He Can\'t!');
                    expect(sendGridBodyCalls[1].content).toEqual([{ type: 'text/html', value: '<h1>He is a pig!</h1>' }]);
                    done();
                });
        });

        it('should skip invalid recipients', done => {
            let sendGridBody = {};
            const customMails = {
                mailId: {
                    recipients: ['test@example.com', '', undefined, 'nonValid@email', 'spider@pig.com', null],
                    subject: 'Can He Swing?',
                    content: '<h1>From A Web</h1>'
                }
            };

            mockPendingEmailsRead(null, customMails);
            mockSendGrid(202, body => {
                sendGridBody = body;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBody.personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBody.personalizations[0].subject).toEqual('Can He Swing?');
                    expect(sendGridBody.personalizations[1].to).toEqual([{ email: 'spider@pig.com' }]);
                    expect(sendGridBody.personalizations[1].subject).toEqual('Can He Swing?');
                    expect(sendGridBody.content).toEqual([{ type: 'text/html', value: '<h1>From A Web</h1>' }]);
                    done();
                });
        });

        it('should remove mail from db after success sending', done => {
            const customMails = {
                mailId: {
                    recipients: ['test@example.com'],
                    subject: 'Can He Swing?',
                    content: '<h1>From A Web</h1>'
                }
            };

            mockPendingEmailsRead(null, customMails);
            mockSendGrid(202);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(serverDB.remove).toHaveBeenCalledWith('pendingEmails/custom/mailId');
                    done();
                });
        });

        it('should NOT remove mail from db if sending mail failed', done => {
            const customMails = {
                mailId: {
                    recipients: ['test@example.com'],
                    subject: 'Can He Swing?',
                    content: '<h1>From A Web</h1>'
                }
            };

            mockPendingEmailsRead(null, customMails);
            mockSendGrid(400);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(serverDB.remove).not.toHaveBeenCalled();
                    done();
                });
        });

    });

    describe('both pending and custom emails', () => {

        it('should send all', done => {
            const sendGridBodyCalls = [];
            const pendingTemplates = {
                mailId: {
                    recipients: ['test@example.com'],
                    templateId: 'someTemplateId',
                    substitutions: { '-VS-': 'Hapoel Spider Pig' }
                }
            };
            const customMails = {
                mailId: {
                    recipients: ['test@example.com'],
                    subject: 'Can He Swing?',
                    content: '<h1>From A Web</h1>'
                }
            };

            mockPendingEmailsRead(pendingTemplates, customMails);
            mockSendGrid(202, body => sendGridBodyCalls.push(body), 2);

            pendingEmailsTask.exec()
                .then(() => {
                    expect(sendGridBodyCalls.length).toEqual(2);

                    expect(sendGridBodyCalls[0].personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBodyCalls[0].personalizations[0].substitutions).toEqual({ '-VS-': 'Hapoel Spider Pig' });
                    expect(sendGridBodyCalls[0].template_id).toEqual('someTemplateId');

                    expect(sendGridBodyCalls[1].personalizations[0].to).toEqual([{ email: 'test@example.com' }]);
                    expect(sendGridBodyCalls[1].personalizations[0].subject).toEqual('Can He Swing?');
                    expect(sendGridBodyCalls[1].content).toEqual([{ type: 'text/html', value: '<h1>From A Web</h1>' }]);

                    expect(serverDB.remove.calls.argsFor(0)).toEqual(['pendingEmails/templates/mailId']);
                    expect(serverDB.remove.calls.argsFor(1)).toEqual(['pendingEmails/custom/mailId']);
                    done();
                });
        });

        it('should send none', done => {
            let isSendGridCalled = false;
            mockPendingEmailsRead(null, null);
            mockSendGrid(202, () => {
                isSendGridCalled = true;
            });

            pendingEmailsTask.exec()
                .then(() => {
                    expect(isSendGridCalled).toBe(false);
                    expect(serverDB.remove).not.toHaveBeenCalled();
                    done();
                });
        });

    });
});
