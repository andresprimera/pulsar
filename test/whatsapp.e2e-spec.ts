import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('WhatsApp Webhook (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /whatsapp/webhook (verification)', () => {
    it('should return challenge on valid verification', () => {
      return request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-token',
          'hub.challenge': 'challenge123',
        })
        .expect(200)
        .expect('challenge123');
    });

    it('should return 403 on invalid token', () => {
      return request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge123',
        })
        .expect(403);
    });

    it('should return 403 on invalid mode', () => {
      return request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': 'test-token',
          'hub.challenge': 'challenge123',
        })
        .expect(403);
    });
  });

  describe('POST /whatsapp/webhook', () => {
    it('should return 200 OK for valid payload with known phoneNumberId', () => {
      return request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          entry: [{
            changes: [{
              value: {
                messages: [{
                  from: '1234567890',
                  id: 'msg123',
                  type: 'text',
                  text: { body: 'Hello' },
                }],
                metadata: { phone_number_id: 'phone123' },
              },
            }],
          }],
        })
        .expect(200)
        .expect('ok');
    });

    it('should return 200 OK even for unknown phoneNumberId', () => {
      return request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          entry: [{
            changes: [{
              value: {
                messages: [{
                  from: '1234567890',
                  id: 'msg123',
                  type: 'text',
                  text: { body: 'Hello' },
                }],
                metadata: { phone_number_id: 'unknown-phone' },
              },
            }],
          }],
        })
        .expect(200)
        .expect('ok');
    });

    it('should return 200 OK for non-message payloads', () => {
      return request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({
          entry: [{
            changes: [{
              value: {
                statuses: [{ id: 'status123', status: 'delivered' }],
              },
            }],
          }],
        })
        .expect(200)
        .expect('ok');
    });

    it('should return 200 OK for empty payload', () => {
      return request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .send({})
        .expect(200)
        .expect('ok');
    });
  });
});
