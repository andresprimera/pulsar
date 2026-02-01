import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { UserRepository } from '../database/repositories/user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  async create(dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    return this.userRepository.create({
      ...dto,
      email,
      status: 'active',
    });
  }

  async findAll(status?: 'active' | 'inactive' | 'archived') {
    if (status) {
      return this.userRepository.findByStatus(status);
    }
    return this.userRepository.findAll();
  }

  async findOne(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived users cannot be modified');
    }

    const updates: Partial<CreateUserDto> = { ...dto };
    
    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      
      // Check if email is taken by another user
      if (email !== existing.email) {
        const emailExists = await this.userRepository.findByEmail(email);
        if (emailExists) {
          throw new ConflictException('User with this email already exists');
        }
      }
      updates.email = email;
    }

    const user = await this.userRepository.update(id, updates);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived users cannot be modified');
    }

    const user = await this.userRepository.update(id, {
      status: dto.status,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
