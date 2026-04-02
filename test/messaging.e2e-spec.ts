import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Messaging (e2e)', () => {
  let app: INestApplication;
  let doctorToken: string;
  let patientToken: string;
  let doctorUserId: string;
  let patientUserId: string;
  let conversationId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Register a doctor
    const doctorRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `doctor-${Date.now()}@carypass-test.com`,
        password: 'TestPass123!',
        firstName: 'Dr',
        lastName: 'Test',
        role: 'doctor',
        specialty: 'General',
        licenseNumber: `LIC-${Date.now()}`,
      });
    doctorToken = doctorRes.body.accessToken;
    doctorUserId = doctorRes.body.user.id;

    // Register a patient
    const patientRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `patient-${Date.now()}@carypass-test.com`,
        password: 'TestPass123!',
        firstName: 'Patient',
        lastName: 'Test',
        role: 'patient',
      });
    patientToken = patientRes.body.accessToken;
    patientUserId = patientRes.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /messaging/conversations - should create conversation', async () => {
    const res = await request(app.getHttpServer())
      .post('/messaging/conversations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ otherUserId: patientUserId })
      .expect(200);

    conversationId = res.body.id;
    expect(conversationId).toBeDefined();
  });

  it('POST /messaging/conversations/:id/messages - should send message', () => {
    return request(app.getHttpServer())
      .post(`/messaging/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ content: 'Bonjour, comment allez-vous ?' })
      .expect(201)
      .expect((res) => {
        expect(res.body.content).toBe('Bonjour, comment allez-vous ?');
      });
  });

  it('GET /messaging/conversations/:id/messages - should get messages', () => {
    return request(app.getHttpServer())
      .get(`/messaging/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.messages.length).toBeGreaterThan(0);
      });
  });

  it('GET /messaging/unread - should show unread count', () => {
    return request(app.getHttpServer())
      .get('/messaging/unread')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.unreadCount).toBeGreaterThan(0);
      });
  });

  it('PATCH /messaging/conversations/:id/read - should mark as read', async () => {
    await request(app.getHttpServer())
      .patch(`/messaging/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/messaging/unread')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.body.unreadCount).toBe(0);
  });

  it('Unauthorized user should not access conversation', () => {
    return request(app.getHttpServer())
      .get(`/messaging/conversations/${conversationId}/messages`)
      .expect(401);
  });
});
