import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Agent } from './schemas/agent.schema';
import { AgentChannel } from './schemas/agent-channel.schema';
import { Client } from './schemas/client.schema';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const clientModel = app.get<Model<Client>>(getModelToken('Client'));
  const agentModel = app.get<Model<Agent>>(getModelToken('Agent'));
  const agentChannelModel = app.get<Model<AgentChannel>>(
    getModelToken('AgentChannel'),
  );

  // Seed client
  const client = await clientModel.findOneAndUpdate(
    { name: 'Acme Corp' },
    {
      name: 'Acme Corp',
      status: 'active',
      llmPreferences: {
        provider: 'openai',
        defaultModel: 'gpt-4o-mini',
      },
    },
    { upsert: true, new: true },
  );
  console.log(`Client seeded: ${client._id}`);

  // Seed agent
  const agent = await agentModel.findOneAndUpdate(
    { name: 'Support Bot' },
    {
      name: 'Support Bot',
      systemPrompt: 'You are a helpful support assistant.',
      status: 'active',
    },
    { upsert: true, new: true },
  );
  console.log(`Agent seeded: ${agent._id}`);

  // Seed agent channel
  const agentChannel = await agentChannelModel.findOneAndUpdate(
    { 'channelConfig.phoneNumberId': 'phone123' },
    {
      clientId: client._id.toString(),
      agentId: agent._id.toString(),
      channelType: 'whatsapp',
      enabled: true,
      channelConfig: {
        phoneNumberId: 'phone123',
        accessToken: 'mock-token',
        webhookVerifyToken: 'test-token',
      },
      llmConfig: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || 'sk-mock-key',
        model: 'gpt-4o-mini',
      },
    },
    { upsert: true, new: true },
  );
  console.log(`AgentChannel seeded: ${agentChannel._id}`);

  console.log('Seed complete');
  await app.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
