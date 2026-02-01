import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRepository } from '../database/repositories/user.repository';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepository: any;

  const mockUser = {
    _id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    status: 'active',
  };

  beforeEach(async () => {
    mockUserRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
      findByEmail: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create user with normalized email', async () => {
      const dto = { email: '  TEST@example.com  ', name: 'Test User' };
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({
        ...dto,
        email: 'test@example.com',
        status: 'active',
        _id: 'new-id',
      });

      const result = await service.create(dto);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        ...dto,
        email: 'test@example.com',
        status: 'active',
      });
      expect(result.email).toBe('test@example.com');
    });

    it('should throw ConflictException if email exists', async () => {
      const dto = { email: 'test@example.com', name: 'Test User' };
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all users when no status filter', async () => {
      mockUserRepository.findAll.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(mockUserRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockUser]);
    });

    it('should filter by status when provided', async () => {
      mockUserRepository.findByStatus.mockResolvedValue([mockUser]);

      const result = await service.findAll('active');

      expect(mockUserRepository.findByStatus).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findOne', () => {
    it('should return user by ID', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update user fields and normalize email', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      // Mock findByEmail to return null (email not taken)
      mockUserRepository.findByEmail.mockResolvedValue(null);
      
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        name: 'Updated',
        email: 'updated@example.com',
      });

      const result = await service.update('user-1', {
        name: 'Updated',
        email: ' UPDATED@example.com ',
      });

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'updated@example.com',
      );
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-1', {
        name: 'Updated',
        email: 'updated@example.com',
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw ConflictException if new email is taken', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.findByEmail.mockResolvedValue({
        ...mockUser,
        _id: 'other-user',
      });

      await expect(
        service.update('user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to same email (no conflict)', async () => {
       mockUserRepository.findById.mockResolvedValue(mockUser);
       // Should not call findByEmail if email is same
       mockUserRepository.update.mockResolvedValue(mockUser);

       await service.update('user-1', { email: 'test@example.com' });
       
       expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
       expect(mockUserRepository.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException for archived user', async () => {
      const archivedUser = { ...mockUser, status: 'archived' };
      mockUserRepository.findById.mockResolvedValue(archivedUser);

      await expect(
        service.update('user-1', { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('user-1', { name: 'Updated' }),
      ).rejects.toThrow('Archived users cannot be modified');
    });
  });

  describe('updateStatus', () => {
    it('should update user status', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({
        ...mockUser,
        status: 'inactive',
      });

      const result = await service.updateStatus('user-1', {
        status: 'inactive',
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-1', {
        status: 'inactive',
      });
      expect(result.status).toBe('inactive');
    });

    it('should throw BadRequestException for archived user', async () => {
      const archivedUser = { ...mockUser, status: 'archived' };
      mockUserRepository.findById.mockResolvedValue(archivedUser);

      await expect(
        service.updateStatus('user-1', { status: 'active' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
