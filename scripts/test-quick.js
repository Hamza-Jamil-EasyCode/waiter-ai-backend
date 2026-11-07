const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongooseConfig = require('../src/config/mongoose');
const Tenant = require('../src/models/Tenant');
const AssistantService = require('../src/services/ai/assistant.service');

async function test() {
  await mongooseConfig.connect();
  const tenant = await Tenant.findOne({ slug: 'ai-multilingual-benchmark' });
  
  const res1 = await AssistantService.askQuestion({
    tenant,
    question: 'What dishes do you have on your menu?',
    sessionId: 'test-q1'
  });
  console.log('Q1 Retrieved count:', res1.retrievedItems.length);
  console.log('Q1 Retrieved items:', res1.retrievedItems.map(i => i.name));
  console.log('Q1 Answer preview:', res1.answer.slice(0, 150));

  const res4 = await AssistantService.askQuestion({
    tenant,
    question: 'Which dishes cost less than Rs. 1,000?',
    sessionId: 'test-q4'
  });
  console.log('Q4 Retrieved count:', res4.retrievedItems.length);
  console.log('Q4 Retrieved items:', res4.retrievedItems.map(i => `${i.name} (Rs. ${i.price})`));

  await mongooseConfig.disconnect();
  process.exit(0);
}
test();
