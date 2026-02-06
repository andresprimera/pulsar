import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserRepository } from './user.repository';
import { User } from '../schemas/user.schema';
import { Types } from 'mongoose';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockModel: any;

  const mockUser = {
    _id: new Types.ObjectId(),
    email: 'test@example.com',
    name: 'Test User',
    status: 'active' as const,
    clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
  };

  beforeEach(async () => {
    mockModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getModelToken(User.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create and return new user', async () => {
      mockModel.create.mockResolvedValue([mockUser]);

      const result = await repository.create(mockUser);

      expect(mockModel.create).toHaveBeenCalledWith([mockUser], { session: undefined });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUser]),
      });

      const result = await repository.findAll();

      expect(mockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findById', () => {
    it('should return user when exists', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await repository.findById(mockUser._id.toString());

      expect(mockModel.findById).toHaveBeenCalledWith(mockUser._id.toString());
      expect(result).toEqual(mockUser);
    });

    it('should return null when not exists', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user when exists', async () => {
      mockModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser),
        }),
      });

      const result = await repository.findByEmail('test@example.com');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(result).toEqual(mockUser);
    });

    it('should return null when not exists', async () => {
      mockModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await repository.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByStatus', () => {
    it('should return users filtered by status', async () => {
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUser]),
      });

      const result = await repository.findByStatus('active');

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toEqual([mockUser]);
    });
  });

  describe('update', () => {
    it('should update and return user', async () => {
      const updatedUser = { ...mockUser, name: 'Updated' };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedUser),
      });

      const result = await repository.update(mockUser._id.toString(), { name: 'Updated' });

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUser._id.toString(),
        { name: 'Updated' },
        { new: true },
      );
      expect(result).toEqual(updatedUser);
    });
  });

  describe('findByClient', () => {
    it('should return users for a client', async () => {
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUser]),
      });

      const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
      const result = await repository.findByClient(clientId);

      expect(mockModel.find).toHaveBeenCalledWith({
        clientId: clientId,
      });
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findActiveByClient', () => {
    it('should return active users for a client', async () => {
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUser]),
      });

      const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
      const result = await repository.findActiveByClient(clientId);

      expect(mockModel.find).toHaveBeenCalledWith({
        clientId: clientId,
        status: 'active',
      });
      expect(result).toEqual([mockUser]);
    });
  });
});
