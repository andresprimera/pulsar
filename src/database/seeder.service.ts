import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent } from './schemas/agent.schema';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Production safety guard
    if (process.env.DISABLE_AUTO_SEED === 'true') {
      console.log('[Seeder] Auto seeding disabled');
      return;
    }

    await this.seedAgents();
  }

  private async seedAgents(): Promise<void> {
    // Use exists() for optimized empty-collection check
    const hasAgents = await this.agentModel.exists({});

    if (hasAgents) {
      console.log('[Seeder] Agents collection has data, skipping seed');
      return;
    }

    console.log('[Seeder] Agents collection is empty, seeding...');

    await this.agentModel.create({
      name: 'Support Bot',
      systemPrompt: 'You are a helpful support assistant.',
      status: 'active',
      createdBySeeder: true,
    });

    console.log('[Seeder] Agents seeded successfully');
  }
}
