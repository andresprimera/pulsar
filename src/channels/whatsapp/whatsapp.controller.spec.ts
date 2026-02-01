import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            verifyWebhook: jest.fn(),
            handleIncoming: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    service = module.get(WhatsappService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verify', () => {
    it('should delegate to service.verifyWebhook()', () => {
      service.verifyWebhook.mockReturnValue('challenge123');

      const result = controller.verify('subscribe', 'test-token', 'challenge123');

      expect(service.verifyWebhook).toHaveBeenCalledWith('subscribe', 'test-token', 'challenge123');
      expect(result).toBe('challenge123');
    });
  });

  describe('handleWebhook', () => {
    it('should call service.handleIncoming() and return ok', async () => {
      service.handleIncoming.mockResolvedValue(undefined);
      const payload = { entry: [] };

      const result = await controller.handleWebhook(payload);

      expect(service.handleIncoming).toHaveBeenCalledWith(payload);
      expect(result).toBe('ok');
    });
  });
});
