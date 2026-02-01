import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: any;

  const mockUser = {
    _id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    status: 'active',
  };

  beforeEach(async () => {
    mockUsersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /users', () => {
    it('should call service.create', async () => {
      const dto = { 
        email: 'test@example.com', 
        name: 'New User',
        clientId: '507f1f77bcf86cd799439011'
      };
      mockUsersService.create.mockResolvedValue({ ...dto, _id: 'new-id' });

      const result = await controller.create(dto);

      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
      expect(result).toBeDefined();
    });
  });

  describe('GET /users', () => {
    it('should call service.findAll without status', async () => {
      mockUsersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAll();

      expect(mockUsersService.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockUser]);
    });

    it('should pass status filter to service.findAll', async () => {
      mockUsersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAll('active');

      expect(mockUsersService.findAll).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockUser]);
    });
  });

  describe('GET /users/available', () => {
    it('should call service.findAll with active status', async () => {
      mockUsersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAvailable();

      expect(mockUsersService.findAll).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockUser]);
    });
  });

  describe('GET /users/:id', () => {
    it('should call service.findOne', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-1');

      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUser);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should call service.update', async () => {
      const dto = { name: 'Updated' };
      mockUsersService.update.mockResolvedValue({ ...mockUser, ...dto });

      const result = await controller.update('user-1', dto);

      expect(mockUsersService.update).toHaveBeenCalledWith('user-1', dto);
      expect(result.name).toBe('Updated');
    });
  });

  describe('PATCH /users/:id/status', () => {
    it('should call service.updateStatus', async () => {
      const dto = { status: 'inactive' as const };
      mockUsersService.updateStatus.mockResolvedValue({
        ...mockUser,
        status: 'inactive',
      });

      const result = await controller.updateStatus('user-1', dto);

      expect(mockUsersService.updateStatus).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(result.status).toBe('inactive');
    });
  });
});
