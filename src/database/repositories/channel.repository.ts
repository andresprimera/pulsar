import { Injectable } from '@nestjs/common';
import { Channel } from '../entities/channel.entity';

const MOCK_DATA: Channel[] = [
  {
    id: 'channel-whatsapp',
    type: 'whatsapp',
    provider: 'meta',
  },
];

@Injectable()
export class ChannelRepository {
  async findById(id: string): Promise<Channel | undefined> {
    return MOCK_DATA.find((c) => c.id === id);
  }

  async findAll(): Promise<Channel[]> {
    return MOCK_DATA;
  }
}
