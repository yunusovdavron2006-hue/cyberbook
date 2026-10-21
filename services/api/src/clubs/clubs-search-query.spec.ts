import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { SearchClubsDto } from './dto/clubs.dto';

/**
 * Regression test for the club-search query params.
 *
 * The web/mobile explorers send the free-text filter as `q`, while the public
 * API documents it as `search`. The global ValidationPipe runs with
 * `forbidNonWhitelisted: true`, so an undeclared `q` used to make every search
 * fail with HTTP 400 ("Property q should not exist") — which surfaced in the UI
 * as "Could not reach the API". This suite pins the contract: both spellings
 * must be accepted (and forwarded), while genuinely unknown params stay rejected
 * so the strict whitelist is not silently disabled.
 */
describe('ClubsController search query params', () => {
  let app: INestApplication;
  let search: jest.Mock;

  const paged = { items: [], page: 1, size: 12, total: 0, totalPages: 0 };

  beforeAll(async () => {
    search = jest.fn().mockResolvedValue(paged);
    const moduleRef = await Test.createTestingModule({
      controllers: [ClubsController],
      providers: [{ provide: ClubsService, useValue: { search } }],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror services/api/src/main.ts so the test exercises the real pipeline.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => search.mockClear());

  it('accepts the legacy `q` alias (was HTTP 400 before the fix)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/clubs')
      .query({ q: 'cyber', size: 24 })
      .expect(200);

    const dto = search.mock.calls[0][0] as SearchClubsDto;
    expect(dto.q).toBe('cyber');
    expect(dto.size).toBe(24);
  });

  it('accepts the documented `search` parameter', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/clubs')
      .query({ search: 'cyber' })
      .expect(200);

    expect((search.mock.calls[0][0] as SearchClubsDto).search).toBe('cyber');
  });

  it('passes through city/category alongside the search term', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/clubs')
      .query({ q: 'arena', city: 'Tashkent', category: 'VIP_PC', size: 50 })
      .expect(200);

    const dto = search.mock.calls[0][0] as SearchClubsDto;
    expect(dto).toMatchObject({ q: 'arena', city: 'Tashkent', category: 'VIP_PC', size: 50 });
  });

  it('still rejects unknown query parameters (strict whitelist kept)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/clubs')
      .query({ bogus: '1' })
      .expect(400);
  });
});
